import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { BARBEIRO_CREDENCIAIS } from "@/lib/constants";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Verificar autenticação quando o componente é montado
    const checkAuth = () => {
      try {
        // Verificar se o token existe e é válido
        const authToken = localStorage.getItem("barber_auth_token");
        const authTimestamp = localStorage.getItem("barber_auth_timestamp");
        const authEmail = localStorage.getItem("barber_auth_email");
        
        // Se algum dos itens não existir, não está autenticado
        if (!authToken || !authTimestamp || !authEmail) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
        
        // Verificar se o email armazenado corresponde ao email do barbeiro
        if (authEmail !== BARBEIRO_CREDENCIAIS.email) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
        
        // Verificar se o token não expirou (24 horas)
        const timestamp = parseInt(authTimestamp, 10);
        const now = Date.now();
        const tokenAge = now - timestamp;
        const tokenMaxAge = 24 * 60 * 60 * 1000; // 24 horas em milissegundos
        
        if (tokenAge > tokenMaxAge) {
          // Token expirado, limpar dados de autenticação
          localStorage.removeItem("barber_auth_token");
          localStorage.removeItem("barber_auth_timestamp");
          localStorage.removeItem("barber_auth_email");
          localStorage.removeItem("barber_authenticated");
          setIsAuthenticated(false);
        } else {
          // Token válido
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error("Erro ao verificar autenticação:", error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
    
    // Verificar autenticação quando a janela recebe foco
    const handleFocus = () => checkAuth();
    window.addEventListener("focus", handleFocus);
    
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Mostrar um indicador de carregamento enquanto verifica a autenticação
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Redirecionar para login se não estiver autenticado
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Renderizar o conteúdo protegido se estiver autenticado
  return <>{children}</>;
};

export default ProtectedRoute;