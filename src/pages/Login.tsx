
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { BARBEIRO_CREDENCIAIS } from "@/lib/constants";

const formSchema = z.object({
  email: z.string().email("Email inválido"),
  senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      senha: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setError(null);
      
      // Verificar credenciais do barbeiro
      if (values.email === BARBEIRO_CREDENCIAIS.email && values.senha === BARBEIRO_CREDENCIAIS.senha) {
        // Gerar um token de autenticação (simplificado para demonstração)
        const authToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const timestamp = Date.now();
        
        // Armazenar dados de autenticação no localStorage
        localStorage.setItem("barber_auth_token", authToken);
        localStorage.setItem("barber_auth_timestamp", timestamp.toString());
        localStorage.setItem("barber_auth_email", values.email);
        localStorage.setItem("barber_authenticated", "true");
        
        toast({
          title: "Login realizado com sucesso!",
          description: "Bem-vindo à área do barbeiro.",
        });
        
        // Redirecionar para a área do barbeiro
        setTimeout(() => navigate("/barbeiro"), 1500);
      } else {
        setError("Credenciais inválidas. Por favor, verifique seu email e senha.");
      }
    } catch (err) {
      setError("Falha no login. Verifique suas credenciais.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="/lovable-uploads/a313fca3-1781-4832-a011-eb22c0d3b248.png" alt="Logo Barbearia do Gansinho" />
              <AvatarFallback>BG</AvatarFallback>
            </Avatar>
            <h1 className="text-xl font-bold text-gray-900">Barbearia do Gansinho</h1>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md px-4 py-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Entrar</h2>
              <p className="text-gray-600 mt-2">Acesse sua conta para gerenciar seus agendamentos</p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="seu@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="senha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="********" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Entrar
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm">
              <p className="text-gray-600">
                Não tem uma conta?{" "}
                <Link to="/register" className="text-blue-600 hover:underline">
                  Cadastre-se
                </Link>
              </p>
            </div>
          </div>
        </div>
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

export default Login;
