
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn, formatarTelefoneWhatsApp } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { agendamentoService, supabase, type Agendamento } from "@/lib/supabase";
import { recurringAgendamentoService } from "@/lib/recurring-agendamentos";
import { availabilityService } from "@/lib/availability-service";

// Dados simulados
const servicos = [
  { id: 1, nome: "Corte de Cabelo", preco: 35, duracao: 30 },
  { id: 2, nome: "Barba", preco: 25, duracao: 20 },
  { id: 3, nome: "Corte + Barba", preco: 55, duracao: 50 },
  { id: 4, nome: "Acabamento", preco: 20, duracao: 15 },
];

// Importar número de telefone da barbearia das constantes
import { BARBEARIA_TELEFONE } from "@/lib/constants";

// Estrutura para armazenar os horários agendados
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
  servico: z.number({
    required_error: "Selecione um serviço",
  }),
});

const Scheduling = () => {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [confirmarDialog, setConfirmarDialog] = useState(false);
  const [servicoSelecionado, setServicoSelecionado] = useState<number | null>(null);
  
  // Estado para armazenar os horários disponíveis
  const [horariosDisponiveis, setHorariosDisponiveis] = useState<string[]>(initialHorariosDisponiveis);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      telefone: "",
    },
  });

  // Carregar agendamentos ao montar o componente e configurar subscription
  useEffect(() => {
    const carregarAgendamentos = async () => {
      try {
        const data = await agendamentoService.listarAgendamentos();
        setAgendamentos(data);
      } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        setError('Não foi possível carregar os horários disponíveis.');
      }
    };
    
    carregarAgendamentos();
    
    // Configurar subscription para atualizações em tempo real
    const unsubscribe = agendamentoService.subscribeToAgendamentos((novosDados) => {
      console.log('Agendamentos atualizados em tempo real:', novosDados);
      setAgendamentos(novosDados);
    });
    
    // Limpar subscription quando o componente for desmontado
    return () => {
      unsubscribe();
    };
  }, []);

  // Atualizar horários disponíveis quando a data for selecionada
  useEffect(() => {
    const selectedDate = form.watch("data");

    if (selectedDate) {
      const dateKey = format(selectedDate, "yyyy-MM-dd");
      const diaSemana = selectedDate.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
      
      // Função para obter horários disponíveis diretamente do banco de dados
      const obterHorariosDisponiveis = async () => {
        try {
          // Buscar todos os agendamentos para a data de uma só vez
          const { data: agendamentosData, error } = await supabase
            .from('agendamentos')
            .select('*')
            .eq('data', dateKey)
            .not('status', 'eq', 'cancelado');
          if (error) throw error;
          
          // Extrair horários ocupados dos agendamentos normais
          const horariosOcupadosNormais = agendamentosData.map(a => a.horario);
          console.log(`Horários ocupados normais para ${dateKey}:`, horariosOcupadosNormais);
          
          // Buscar todos os agendamentos recorrentes para o dia da semana de uma só vez
          const { data: agendamentosRecorrentes, error: errorRecorrentes } = await supabase
            .from('recurring_agendamentos')
            .select('*')
            .eq('dia_semana', diaSemana)
            .eq('status', 'ativo');
          
          // Nota: Estamos usando o serviço de agendamentos recorrentes para verificar disponibilidade
          
          if (errorRecorrentes) throw errorRecorrentes;
          
          // Extrair horários ocupados dos agendamentos recorrentes
          const horariosOcupadosRecorrentes = agendamentosRecorrentes.map(a => a.horario);
          console.log(`Horários ocupados recorrentes para dia ${diaSemana}:`, horariosOcupadosRecorrentes);
          
          // Verificar horários pendentes
          const horariosPendentes = initialHorariosDisponiveis.filter(horario => 
            availabilityService.verificarHorarioPendente(dateKey, horario)
          );
          console.log(`Horários pendentes para ${dateKey}:`, horariosPendentes);
          
          // Combinar todos os horários ocupados
          const todosHorariosOcupados = [...new Set([
            ...horariosOcupadosNormais, 
            ...horariosOcupadosRecorrentes,
            ...horariosPendentes
          ])];
          
          // Filtrar horários disponíveis
          const horariosDisponiveisAtualizados = initialHorariosDisponiveis.filter(h => !todosHorariosOcupados.includes(h));
          console.log(`Horários disponíveis para ${dateKey}:`, horariosDisponiveisAtualizados);
          
          setHorariosDisponiveis(horariosDisponiveisAtualizados);
          
          // Limpar horário selecionado se não estiver mais disponível
          const horarioAtual = form.getValues("horario");
          if (horarioAtual && !horariosDisponiveis.includes(horarioAtual)) {
            form.setValue("horario", "");
          }
        } catch (error) {
          console.error("Erro ao obter horários disponíveis:", error);
          setError("Não foi possível verificar a disponibilidade dos horários. Por favor, tente novamente.");
          
          // Em caso de erro, manter os horários disponíveis atuais
          // ou filtrar apenas pelos agendamentos normais visíveis
          const agendamentosData = agendamentos.filter((agendamento) => {
            if (!agendamento?.data) return false;
            const agendamentoDateStr = typeof agendamento.data === 'string' ? agendamento.data.split('T')[0] : null;
            return agendamentoDateStr === dateKey && agendamento.status !== 'cancelado';
          });
          
          const horariosOcupadosNormais = agendamentosData.map(a => a.horario);
          setHorariosDisponiveis(initialHorariosDisponiveis.filter(
            (h) => !horariosOcupadosNormais.includes(h)
          ));
        }
      };

      obterHorariosDisponiveis();
    }
  }, [form.watch("data"), agendamentos]);

  const salvarAgendamento = async (valores: z.infer<typeof formSchema>) => {
    try {
      const servico = servicos.find(s => s.id === valores.servico);
      if (!servico) throw new Error('Serviço não encontrado');

      // Formatar o telefone para o formato do WhatsApp antes de salvar
      const telefoneFormatado = formatarTelefoneWhatsApp(valores.telefone);

      // Verificar novamente a disponibilidade antes de salvar
      const dateKey = format(valores.data, "yyyy-MM-dd");
      const diaSemana = valores.data.getDay();
      
      // Verificar disponibilidade para agendamentos normais e recorrentes
      const disponivelNormal = await availabilityService.verificarDisponibilidadeNormal(dateKey, valores.horario);
      const disponivelRecorrente = await availabilityService.verificarDisponibilidadeRecorrente(diaSemana, valores.horario);
      
      if (!disponivelNormal || !disponivelRecorrente) {
        console.error(`Horário ${valores.horario} não está mais disponível no momento do salvamento`);
        throw new Error('Este horário não está mais disponível. Por favor, selecione outro horário.');
      }

      const novoAgendamento = {
        nome: valores.nome,
        telefone: telefoneFormatado,
        servico: servico.nome,
        data: format(valores.data, "yyyy-MM-dd") + 'T00:00:00',
        horario: valores.horario,
        status: 'pendente' as const
      };

      const agendamentoCriado = await agendamentoService.criarAgendamento(novoAgendamento);
      setAgendamentos(prev => [...prev, agendamentoCriado]);
      
      // Invalidar o cache para este horário específico
      availabilityService.invalidarCache(dateKey, valores.horario, diaSemana);
      
      return agendamentoCriado;
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      throw error;
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setError(null);
      console.log("Agendamento:", values);
      
      // Limpar o cache para garantir dados atualizados
      availabilityService.limparCache();
      
      // Verificar se o horário ainda está disponível usando o serviço com cache
      const dateKey = format(values.data, "yyyy-MM-dd");
      const diaSemana = values.data.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
      
      console.log(`Verificando disponibilidade para: ${dateKey} ${values.horario} (dia ${diaSemana})`);
      
      // Verificar disponibilidade para agendamentos normais e recorrentes
      // Usar os serviços de disponibilidade para verificar
      const disponivelNormal = await availabilityService.verificarDisponibilidadeNormal(dateKey, values.horario);
      
      if (!disponivelNormal) {
        console.log(`Horário ${values.horario} não disponível para agendamentos normais`);
        setError("Este horário não está mais disponível. Por favor, selecione outro.");
        return;
      }
      
      // Verificar disponibilidade para agendamentos recorrentes
      const disponivelRecorrente = await availabilityService.verificarDisponibilidadeRecorrente(diaSemana, values.horario);
      
      console.log('Verificação de disponibilidade recorrente:', { dia_semana: diaSemana, horario: values.horario, disponivel: disponivelRecorrente });
      
      if (!disponivelRecorrente) {
        console.log(`Horário ${values.horario} não disponível para agendamentos recorrentes`);
        setError("Este horário está reservado para um cliente recorrente. Por favor, selecione outro horário.");
        return;
      }
      
      console.log(`Horário ${values.horario} disponível, marcando como pendente`);
      
      // Marcar o horário como pendente por 2 minutos (120000ms)
      availabilityService.adicionarHorarioPendente(dateKey, values.horario, 120000);
      
      // Atualizar a lista de horários disponíveis imediatamente
      setHorariosDisponiveis(prev => prev.filter(h => h !== values.horario));
      
      // Abrir diálogo de confirmação
      setConfirmarDialog(true);
    } catch (err) {
      console.error('Erro ao verificar disponibilidade:', err);
      setError("Falha ao processar o agendamento. Tente novamente.");
    }
  };

  const handleCancelarDialog = () => {
    // Remover o horário da lista de pendentes
    const values = form.getValues();
    if (values.data && values.horario) {
      const dateKey = format(values.data, "yyyy-MM-dd");
      availabilityService.removerHorarioPendente(dateKey, values.horario);
      
      // Recarregar os horários disponíveis
      const diaSemana = values.data.getDay();
      availabilityService.obterHorariosDisponiveis(dateKey, diaSemana, initialHorariosDisponiveis)
        .then(horarios => setHorariosDisponiveis(horarios))
        .catch(err => console.error("Erro ao recarregar horários:", err));
    }
    
    setConfirmarDialog(false);
  };

  const enviarParaWhatsApp = async () => {
    try {
      // Obter os valores do formulário
      const values = form.getValues();
      const servico = servicos.find(s => s.id === values.servico);
      
      if (!servico) {
        throw new Error('Serviço não encontrado');
      }
      
      // Formatar a data
      const dataFormatada = format(values.data, "dd/MM/yyyy", { locale: ptBR });
      const dateKey = format(values.data, "yyyy-MM-dd");
      const diaSemana = values.data.getDay();
      
      // Verificar novamente a disponibilidade antes de salvar
      // Usar os serviços de disponibilidade para verificar
      const disponivelNormal = await availabilityService.verificarDisponibilidadeNormal(dateKey, values.horario);
      const disponivelRecorrente = await availabilityService.verificarDisponibilidadeRecorrente(diaSemana, values.horario);
      
      console.log('Verificação final de disponibilidade:', { 
        data: dateKey, 
        horario: values.horario, 
        disponivelNormal, 
        disponivelRecorrente 
      });
      
      if (!disponivelNormal || !disponivelRecorrente) {
        console.error(`Horário ${values.horario} não está mais disponível no momento do salvamento`);
        toast({
          title: "Horário indisponível",
          description: "Este horário não está mais disponível. Por favor, selecione outro horário.",
        });
        
        // Remover o horário da lista de pendentes
        availabilityService.removerHorarioPendente(dateKey, values.horario);
        
        // Recarregar os horários disponíveis usando o serviço de disponibilidade
        const obterHorariosAtualizados = async () => {
          try {
            // Usar o serviço de disponibilidade para obter os horários disponíveis
            const horariosDisponiveis = await availabilityService.obterHorariosDisponiveis(
              dateKey, 
              diaSemana, 
              initialHorariosDisponiveis
            );
            
            // Atualizar horários disponíveis
            setHorariosDisponiveis(horariosDisponiveis);
          } catch (err) {
            console.error("Erro ao recarregar horários:", err);
          }
        };
        
        obterHorariosAtualizados();
        
        // Fechar o diálogo de confirmação
        setConfirmarDialog(false);
        return;
      }
      
      try {
        // Salvar o agendamento no banco de dados e garantir que seja concluído
        const agendamentoCriado = await salvarAgendamento(values);
        console.log('Agendamento criado com sucesso:', agendamentoCriado);
        
        // Mensagem para o cliente
        const mensagemCliente = `Olá! Gostaria de agendar um horário na Barbearia do Gansinho.\n\nServiço: ${servico.nome}\nData: ${dataFormatada}\nHorário: ${values.horario}\nNome: ${values.nome}\nTelefone: ${values.telefone}`;
        
        // Codificar a mensagem para URL
        const mensagemClienteCodificada = encodeURIComponent(mensagemCliente);
        
        // Construir o link do WhatsApp para o cliente com o telefone formatado
        const telefoneFormatado = formatarTelefoneWhatsApp(BARBEARIA_TELEFONE);
        const linkWhatsAppCliente = `https://wa.me/${telefoneFormatado}?text=${mensagemClienteCodificada}`;
        
        // Fechar o diálogo de confirmação
        setConfirmarDialog(false);
        
        // Mostrar mensagem de sucesso
        toast({
          title: "Agendamento confirmado!",
          description: "Você será redirecionado para o WhatsApp para confirmar seu agendamento.",
        });
        
        // Limpar o formulário
        form.reset();
        
        // Abrir o link em uma nova aba para o cliente após tudo estar concluído
        window.open(linkWhatsAppCliente, "_blank");
      } catch (saveError) {
        console.error('Erro ao salvar agendamento no banco de dados:', saveError);
        throw saveError; // Propagar o erro para ser tratado no catch externo
      }
    } catch (error) {
      console.error('Erro ao processar agendamento:', error);
      toast({
        title: "Erro ao salvar agendamento",
        description: "Não foi possível salvar seu agendamento. Por favor, tente novamente.",
      });
      
      // Em caso de erro, remover o horário da lista de pendentes
      const values = form.getValues();
      if (values.data && values.horario) {
        const dateKey = format(values.data, "yyyy-MM-dd");
        availabilityService.removerHorarioPendente(dateKey, values.horario);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="/lovable-uploads/a313fca3-1781-4832-a011-eb22c0d3b248.png" alt="Logo Barbearia do Gansinho" />
              <AvatarFallback>BG</AvatarFallback>
            </Avatar>
            <h1 className="text-xl font-bold text-gray-900">Barbearia do Gansinho</h1>
          </Link>
          <div className="flex space-x-4">
            <Button variant="outline" asChild>
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Cadastrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Agende seu horário</h2>
          
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-white rounded-lg shadow-md p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Informações pessoais</h3>
                    
                    <FormField
                      control={form.control}
                      name="nome"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel>Nome completo</FormLabel>
                          <FormControl>
                            <Input placeholder="Seu nome" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="telefone"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel>Telefone (WhatsApp)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="(00) 00000-0000" 
                              {...field} 
                              onChange={(e) => {
                                // Filtra apenas números - remove todos os caracteres não numéricos
                                const numeroLimpo = e.target.value.replace(/\D/g, '');
                                field.onChange(numeroLimpo);
                              }}
                              value={field.value}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Detalhes do agendamento</h3>
                    
                    {/* Serviço */}
                    <FormField
                      control={form.control}
                      name="servico"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel>Serviço</FormLabel>
                          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                            {servicos.map((servico) => (
                              <Card 
                                key={servico.id} 
                                className={cn(
                                  "cursor-pointer transition-all hover:shadow-md",
                                  field.value === servico.id ? "border-2 border-primary" : ""
                                )}
                                onClick={() => {
                                  field.onChange(servico.id);
                                  setServicoSelecionado(servico.id);
                                }}
                              >
                                <CardHeader className="p-4">
                                  <CardTitle className="text-base">{servico.nome}</CardTitle>
                                  <p className="text-sm text-gray-500">{servico.duracao} min | R$ {servico.preco}</p>
                                </CardHeader>
                              </Card>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Data */}
                  <FormField
                    control={form.control}
                    name="data"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Data</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                type="button"
                              >
                                {field.value ? (
                                  format(field.value, "PPP", { locale: ptBR })
                                ) : (
                                  <span>Selecione uma data</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                // Desabilitar datas passadas e domingos (0 = domingo)
                                return date < today || date.getDay() === 0;
                              }}
                              locale={ptBR}
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Horário */}
                  <FormField
                    control={form.control}
                    name="horario"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Horário</FormLabel>
                        <div className="grid grid-cols-4 gap-2">
                          {horariosDisponiveis.length > 0 ? (
                            horariosDisponiveis.map((horario) => (
                              <Button
                                key={horario}
                                type="button"
                                variant={field.value === horario ? "default" : "outline"}
                                onClick={() => field.onChange(horario)}
                                className="text-sm"
                              >
                                {horario}
                              </Button>
                            ))
                          ) : (
                            <div className="col-span-4 text-center p-4 border border-dashed rounded-md">
                              <p className="text-muted-foreground">Não há horários disponíveis para esta data</p>
                            </div>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="flex justify-end pt-4">
                  <Button 
                    type="submit" 
                    size="lg"
                    disabled={horariosDisponiveis.length === 0}
                  >
                    Confirmar agendamento
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </main>

      <AlertDialog open={confirmarDialog} onOpenChange={setConfirmarDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Ao confirmar, você será redirecionado para o WhatsApp para finalizar seu agendamento com a barbearia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={enviarParaWhatsApp}>
              Confirmar e prosseguir para o WhatsApp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

export default Scheduling;
