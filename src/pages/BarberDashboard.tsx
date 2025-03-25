import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { agendamentoService, type Agendamento } from "@/lib/supabase";
import { RecurringScheduleDialog } from "@/components/RecurringScheduleDialog";
import { RecurringScheduleList } from "@/components/RecurringScheduleList";
import { recurringAgendamentoService } from "@/lib/recurring-agendamentos";
import { availabilityService } from "@/lib/availability-service";
import { CleanupDashboard } from "@/components/CleanupDashboard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BARBEARIA_TELEFONE } from "@/lib/constants";
import { formatarTelefoneWhatsApp } from "@/lib/utils";

// Convertendo a data do Supabase para Date
const convertToDate = (dateStr: string | Date): Date => {
  try {
    // Se já for um objeto Date, retorna ele mesmo
    if (dateStr instanceof Date) {
      return dateStr;
    }
    
    // Se for string, processa adequadamente
    if (typeof dateStr === 'string') {
      // Garantir que a data seja interpretada como UTC para evitar problemas de fuso horário
      // Formato: YYYY-MM-DD
      if (dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }
      
      // Verificar se a string está no formato esperado
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        console.error('Formato de data inválido:', dateStr);
        return new Date(); // Retorna data atual em caso de formato inválido
      }
      
      // Criar a data no formato YYYY-MM-DD para evitar ajustes de fuso horário
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // Verificar se os componentes da data são válidos
      if (isNaN(year) || isNaN(month) || isNaN(day) || 
          month < 1 || month > 12 || day < 1 || day > 31) {
        console.error('Componentes de data inválidos:', { year, month, day });
        return new Date();
      }
      
      const date = new Date(year, month - 1, day, 12, 0, 0);
      
      if (isNaN(date.getTime())) {
        console.error('Data inválida após conversão');
        return new Date();
      }
      return date;
    }
    
    // Se não for string nem Date, retorna data atual
    console.error('Tipo de data não suportado:', typeof dateStr);
    return new Date();
  } catch (error) {
    console.error('Erro ao converter data:', error);
    return new Date();
  }
};

const servicos = [
  { id: 1, nome: "Corte de Cabelo", preco: 35, duracao: 30 },
  { id: 2, nome: "Barba", preco: 25, duracao: 20 },
  { id: 3, nome: "Corte + Barba", preco: 55, duracao: 50 },
  { id: 4, nome: "Acabamento", preco: 20, duracao: 15 },
];

const initialHorariosDisponiveis = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", 
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"
];

const formSchema = z.object({
  nome: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  telefone: z.string().min(10, "Telefone inválido"),
  data: z.date({
    required_error: "Selecione uma data para o agendamento",
  }),
  horario: z.string({
    required_error: "Selecione um horário",
  }),
  servico: z.string({
    required_error: "Selecione um serviço",
  }),
});

type FormData = z.infer<typeof formSchema>;

const BarberDashboard = () => {
  const { toast } = useToast();
  const [date, setDate] = useState<Date>(new Date());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [horariosDisponiveis, setHorariosDisponiveis] = useState<string[]>(initialHorariosDisponiveis);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState<Agendamento | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      telefone: "",
    },
  });

  useEffect(() => {
    const carregarAgendamentos = async () => {
      try {
        const data = await agendamentoService.listarAgendamentos();
        const formattedAgendamentos = data
          .filter(agendamento => agendamento && agendamento.data)
          .map(agendamento => {
            try {
              const dateStr = typeof agendamento.data === 'string' 
                ? agendamento.data.split('T')[0] 
                : agendamento.data;
              
              return {
                ...agendamento,
                data: convertToDate(dateStr)
              };
            } catch (error) {
              console.error('Erro ao processar data:', error);
              return null;
            }
          })
          .filter(Boolean);
        
        setAgendamentos(formattedAgendamentos);
      } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os agendamentos.",
        });
      }
    };
    carregarAgendamentos();
  }, [toast]);

  useEffect(() => {
    const selectedDate = form.watch("data");
    if (selectedDate) {
      const dateKey = format(selectedDate, "yyyy-MM-dd");
      const diaSemana = selectedDate.getDay();

      // Usar o serviço otimizado com cache para obter horários disponíveis
      const obterHorariosDisponiveis = async () => {
        try {
          // Obter horários disponíveis usando o serviço com cache
          const horariosDisponiveis = await availabilityService.obterHorariosDisponiveis(
            dateKey,
            diaSemana,
            initialHorariosDisponiveis
          );
          
          setHorariosDisponiveis(horariosDisponiveis);
          
          // Limpar horário selecionado se não estiver mais disponível
          const horarioAtual = form.getValues("horario");
          if (horarioAtual && !horariosDisponiveis.includes(horarioAtual)) {
            form.setValue("horario", "");
            toast({
              title: "Horário indisponível",
              description: "O horário selecionado não está mais disponível. Por favor, escolha outro horário.",
            });
          }
        } catch (error) {
          console.error("Erro ao obter horários disponíveis:", error);
          toast({
            title: "Erro ao verificar disponibilidade",
            description: "Não foi possível verificar a disponibilidade dos horários. Por favor, tente novamente.",
          });
          
          // Em caso de erro, filtrar apenas pelos agendamentos normais visíveis
          const agendamentosData = agendamentos.filter((agendamento) => {
            if (!agendamento?.data) return false;
            try {
              const formattedDate = format(agendamento.data, "yyyy-MM-dd");
              return formattedDate === dateKey && agendamento.status !== "cancelado";
            } catch (error) {
              console.error('Erro ao processar data do agendamento:', error);
              return false;
            }
          });
          
          const horariosOcupadosNormais = agendamentosData.map((a) => a.horario);
          setHorariosDisponiveis(initialHorariosDisponiveis.filter(
            (h) => !horariosOcupadosNormais.includes(h)
          ));
        }
      };

      obterHorariosDisponiveis();
    } else {
      // Resetar horários disponíveis quando não houver data selecionada
      setHorariosDisponiveis(initialHorariosDisponiveis);
    }
  }, [form.watch("data"), agendamentos, form, toast]);


  const [loading, setLoading] = useState(false);
  const onSubmit = async (values: FormData) => {
    try {
      setLoading(true);
      const servicoNome = servicos.find((s) => s.id.toString() === values.servico)?.nome || "";
      const novoAgendamento = {
        nome: values.nome,
        telefone: values.telefone,
        servico: servicoNome,
        data: format(values.data, "yyyy-MM-dd"),
        horario: values.horario,
        status: "pendente" as const
      };

      const agendamentoCriado = await agendamentoService.criarAgendamento(novoAgendamento);
      if (agendamentoCriado && agendamentoCriado.data) {
        setAgendamentos(prev => [...prev, { ...agendamentoCriado, data: convertToDate(agendamentoCriado.data) }]);
      }
      
      setDialogOpen(false);
      form.reset();
      toast({
        title: "Agendamento criado",
        description: "O agendamento foi criado com sucesso!",
      });
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o agendamento.",
      });
    } finally {
      setLoading(false);
    }
  };

  const enviarMensagemWhatsApp = (agendamento: Agendamento, novoStatus: "confirmado" | "cancelado") => {
    try {
      // Formatar a data para exibição
      const dataFormatada = format(agendamento.data, "dd/MM/yyyy", { locale: ptBR });
      
      // Criar a mensagem com base no status
      let mensagem = "";
      if (novoStatus === "confirmado") {
        mensagem = `Olá ${agendamento.nome}! Seu agendamento na Barbearia do Gansinho foi confirmado.\n\nServiço: ${agendamento.servico}\nData: ${dataFormatada}\nHorário: ${agendamento.horario}\n\nAguardamos você!`;
      } else if (novoStatus === "cancelado") {
        mensagem = `Olá ${agendamento.nome}! Infelizmente precisamos cancelar seu agendamento na Barbearia do Gansinho.\n\nServiço: ${agendamento.servico}\nData: ${dataFormatada}\nHorário: ${agendamento.horario}\n\nPor favor, entre em contato conosco para reagendar.`;
      }
      
      // Codificar a mensagem para URL
      const mensagemCodificada = encodeURIComponent(mensagem);
      
      // Construir o link do WhatsApp com o telefone formatado
      const telefoneFormatado = formatarTelefoneWhatsApp(agendamento.telefone);
      const linkWhatsApp = `https://wa.me/${telefoneFormatado}?text=${mensagemCodificada}`;
      
      // Abrir o link em uma nova aba
      window.open(linkWhatsApp, "_blank");
    } catch (error) {
      console.error('Erro ao enviar mensagem WhatsApp:', error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar a mensagem WhatsApp.",
      });
    }
  };

  const atualizarStatusAgendamento = async (agendamento: Agendamento, novoStatus: "confirmado" | "cancelado") => {
    try {
      await agendamentoService.atualizarStatus(agendamento.id, novoStatus);
      
      const novosAgendamentos = agendamentos.map((a) =>
        a.id === agendamento.id ? { ...a, status: novoStatus } : a
      );
      setAgendamentos(novosAgendamentos);

      // Enviar mensagem WhatsApp após atualizar o status
      enviarMensagemWhatsApp(agendamento, novoStatus);

      toast({
        title: `Agendamento ${novoStatus}`,
        description: `O agendamento foi ${novoStatus} com sucesso e uma mensagem foi enviada ao cliente.`,
      });
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status do agendamento.",
      });
    }
  };

  const agendamentosDoDia = agendamentos.filter(
    (agendamento) =>
      format(agendamento.data, "yyyy-MM-dd") === format(date, "yyyy-MM-dd") && 
      agendamento.status !== "cancelado"
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmado":
        return "bg-green-500";
      case "cancelado":
        return "bg-red-500";
      default:
        return "bg-yellow-500";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col">
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      )}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage
                src="/lovable-uploads/a313fca3-1781-4832-a011-eb22c0d3b248.png"
                alt="Logo Barbearia do Gansinho"
              />
              <AvatarFallback>BG</AvatarFallback>
            </Avatar>
            <h1 className="text-xl font-bold text-gray-900">
              Barbearia do Gansinho - Área do Barbeiro
            </h1>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => {
              // Limpar todos os dados de autenticação
              localStorage.removeItem("barber_auth_token");
              localStorage.removeItem("barber_auth_timestamp");
              localStorage.removeItem("barber_auth_email");
              localStorage.removeItem("barber_authenticated");
              // Redirecionar para a página inicial
              window.location.href = "/";
            }}
          >
            Sair
          </Button>
        </div>
      </header>
ste
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Calendário</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border w-full"
                locale={ptBR}
              />
              <div className="space-y-2 mt-4">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full">Novo Agendamento</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Novo Agendamento</DialogTitle>
                    </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="nome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome do cliente</FormLabel>
                            <FormControl>
                              <Input placeholder="Nome do cliente" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="telefone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone</FormLabel>
                            <FormControl>
                              <Input placeholder="(00) 00000-0000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="data"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Data</FormLabel>
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date()}
                              initialFocus
                              locale={ptBR}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="horario"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Horário</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione um horário" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {horariosDisponiveis.map((horario) => (
                                  <SelectItem key={horario} value={horario}>
                                    {horario}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="servico"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Serviço</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione um serviço" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {servicos.map((servico) => (
                                  <SelectItem key={servico.id} value={servico.id.toString()}>
                                    {servico.nome} - R$ {servico.preco}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full">
                        Agendar
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              <div className="space-y-2 mt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setRecurringDialogOpen(true)}
                >
                  Gerenciar Agendamentos Recorrentes
                </Button>
                <CleanupDashboard />
              </div>
            </div>
            </CardContent>
          </Card>

          <div className="space-y-8">
            <RecurringScheduleList onAgendamentoUpdated={() => {
              const selectedDate = form.watch("data");
              if (selectedDate) {
                form.setValue("data", selectedDate);
              }
            }} />
            <Card>
              <CardHeader>
                <CardTitle>
                  Agendamentos do dia {format(date, "dd 'de' MMMM", { locale: ptBR })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {agendamentosDoDia.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    Nenhum agendamento para esta data
                  </p>
                ) : (
                  <div className="space-y-4">
                    {agendamentosDoDia.map((agendamento, index) => (
                      <div
                        key={index}
                        className="p-4 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{agendamento.nome}</h3>
                            <div className="mt-2 space-y-1">
                              <p className="text-sm font-medium text-gray-700">
                                <span className="font-semibold">Telefone:</span> {agendamento.telefone}
                              </p>
                              <p className="text-sm font-medium text-gray-700">
                                <span className="font-semibold">Serviço:</span> {agendamento.servico}
                              </p>
                              <p className="text-sm font-medium text-gray-700">
                                <span className="font-semibold">Data:</span> {format(agendamento.data, "dd/MM/yyyy", { locale: ptBR })}
                              </p>
                              <p className="text-sm font-medium text-gray-700">
                                <span className="font-semibold">Horário:</span> {agendamento.horario}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <Badge
                              className={`${getStatusColor(agendamento.status)} text-white px-3 py-1`}
                            >
                              {agendamento.status.charAt(0).toUpperCase() + agendamento.status.slice(1)}
                            </Badge>
                            {agendamento.status === "pendente" && (
                              <div className="flex space-x-2 mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                                  onClick={() => {
                                    setSelectedAgendamento(agendamento);
                                    setConfirmDialogOpen(true);
                                  }}
                                >
                                  Confirmar
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                                  onClick={() => {
                                    setSelectedAgendamento(agendamento);
                                    setCancelDialogOpen(true);
                                  }}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            )}
                            {agendamento.status === "confirmado" && (
                              <div className="flex space-x-2 mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                                  onClick={() => {
                                    setSelectedAgendamento(agendamento);
                                    setCancelDialogOpen(true);
                                  }}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      <RecurringScheduleDialog
        open={recurringDialogOpen}
        onOpenChange={setRecurringDialogOpen}
        onAgendamentoCreated={() => {
          const selectedDate = form.watch("data");
          if (selectedDate) {
            form.setValue("data", selectedDate);
          }
        }}
      />
      
      {/* Diálogo de confirmação para confirmar agendamento */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja confirmar este agendamento? Uma mensagem será enviada ao cliente informando sobre a confirmação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDialogOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedAgendamento) {
                  atualizarStatusAgendamento(selectedAgendamento, "confirmado");
                  setConfirmDialogOpen(false);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmação para cancelar agendamento */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar este agendamento? Uma mensagem será enviada ao cliente informando sobre o cancelamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelDialogOpen(false)}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedAgendamento) {
                  atualizarStatusAgendamento(selectedAgendamento, "cancelado");
                  setCancelDialogOpen(false);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancelar Agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </main>

      <footer className="bg-white py-6">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-gray-600">
            © 2023 Barbearia do Gansinho. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BarberDashboard;