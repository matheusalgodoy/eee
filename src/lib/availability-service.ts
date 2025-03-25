import { cache } from './cache';
import { agendamentoService, supabase } from './supabase';
import { recurringAgendamentoService } from './recurring-agendamentos';

// Tempo de expiração do cache em milissegundos
const CACHE_EXPIRATION = 3000; // 3 segundos

// Chaves para o cache
const getNormalCacheKey = (data: string, horario: string) => `normal_${data}_${horario}`;
const getRecurringCacheKey = (diaSemana: number, horario: string) => `recurring_${diaSemana}_${horario}`;
const getAvailableTimesCacheKey = (data: string) => `available_times_${data}`;

// Interface para horários disponíveis
interface AvailableTimes {
  horarios: string[];
  timestamp: number;
}

// Interface para horários em processo de agendamento
interface PendingBooking {
  data: string;
  horario: string;
  timestamp: number;
  expiresIn: number;
}

// Armazena horários que estão em processo de agendamento
const pendingBookings: PendingBooking[] = [];

// Serviço otimizado para verificação de disponibilidade
export const availabilityService = {
  // Adiciona um horário à lista de pendentes (em processo de agendamento)
  adicionarHorarioPendente(data: string, horario: string, expiresIn: number = 60000): void {
    // Remove horários pendentes expirados primeiro
    this.limparHorariosPendentesExpirados();
    
    // Adiciona o novo horário pendente
    pendingBookings.push({
      data,
      horario,
      timestamp: Date.now(),
      expiresIn
    });
  },
  
  // Remove um horário da lista de pendentes
  removerHorarioPendente(data: string, horario: string): void {
    const index = pendingBookings.findIndex(p => p.data === data && p.horario === horario);
    if (index !== -1) {
      pendingBookings.splice(index, 1);
    }
  },
  
  // Verifica se um horário está pendente
  verificarHorarioPendente(data: string, horario: string): boolean {
    // Limpar horários pendentes expirados primeiro
    this.limparHorariosPendentesExpirados();
    
    // Verificar se o horário está na lista de pendentes
    const isPendente = pendingBookings.some(p => p.data === data && p.horario === horario);
    
    if (isPendente) {
      console.log(`Horário ${horario} na data ${data} está pendente de agendamento`);
    }
    
    return isPendente;
  },
  
  // Remove horários pendentes expirados
  limparHorariosPendentesExpirados(): void {
    const now = Date.now();
    const expirados = pendingBookings.filter(p => now > p.timestamp + p.expiresIn);
    
    for (const horario of expirados) {
      this.removerHorarioPendente(horario.data, horario.horario);
    }
  },
  // Verifica disponibilidade para agendamentos normais com cache
  async verificarDisponibilidadeNormal(data: string, horario: string): Promise<boolean> {
    // Primeiro verifica se o horário está em processo de agendamento
    if (this.verificarHorarioPendente(data, horario)) {
      console.log(`Horário ${horario} na data ${data} está pendente de agendamento`);
      return false;
    }
    
    // Não usar cache para verificação de disponibilidade
    // Sempre consultar o banco de dados diretamente
    const cacheKey = getNormalCacheKey(data, horario);
    cache.remove(cacheKey);
    
    console.log(`Iniciando verificação de disponibilidade para ${data} ${horario}`);
    
    // Implementar uma verificação mais rigorosa com bloqueio de concorrência
    try {
      // Consulta diretamente o banco de dados para garantir dados atualizados
      // Verificação dupla para garantir que não haja sobreposições
      const disponivel = await agendamentoService.verificarDisponibilidade(data, horario);
      
      if (!disponivel) {
        console.log(`Verificação de disponibilidade normal para ${data} ${horario}: Indisponível (já existe agendamento)`);
        return false;
      }
      
      // Verificar novamente se o horário não foi reservado durante a verificação
      if (this.verificarHorarioPendente(data, horario)) {
        console.log(`Horário ${horario} na data ${data} foi reservado durante a verificação`);
        return false;
      }
      
      // Verificar agendamentos recorrentes também
      const diaSemana = new Date(data).getDay();
      const disponivelRecorrente = await this.verificarDisponibilidadeRecorrente(diaSemana, horario);
      if (!disponivelRecorrente) {
        console.log(`Verificação de disponibilidade recorrente para ${data} ${horario}: Indisponível (existe agendamento recorrente)`);
        return false;
      }
      
      // Armazena o resultado no cache com tempo de expiração reduzido
      cache.set(cacheKey, true, 1000); // 1 segundo de cache
      
      console.log(`Verificação de disponibilidade normal para ${data} ${horario}: Disponível`);
      return true;
    } catch (error) {
      console.error(`Erro ao verificar disponibilidade para ${data} ${horario}:`, error);
      // Em caso de erro, considerar indisponível por segurança
      return false;
    }
  },
  
  // Verifica disponibilidade para agendamentos recorrentes sem cache
  async verificarDisponibilidadeRecorrente(diaSemana: number, horario: string): Promise<boolean> {
    const cacheKey = getRecurringCacheKey(diaSemana, horario);
    
    // Limpar o cache para garantir dados atualizados
    cache.remove(cacheKey);
    
    try {
      // Consulta diretamente o banco de dados para garantir dados atualizados
      const disponivel = await recurringAgendamentoService.verificarDisponibilidade(diaSemana, horario);
      
      // Não armazenar em cache para evitar problemas de sincronização
      // Sempre consultar o banco de dados diretamente
      
      console.log(`Verificação de disponibilidade recorrente para dia ${diaSemana} ${horario}: ${disponivel ? 'Disponível' : 'Indisponível'}`);
      return disponivel;
    } catch (error) {
      console.error(`Erro ao verificar disponibilidade recorrente para dia ${diaSemana} ${horario}:`, error);
      // Em caso de erro, considerar disponível para não bloquear agendamentos desnecessariamente
      return true;
    }
  },
  
  // Obtém todos os horários disponíveis para uma data específica
  async obterHorariosDisponiveis(data: string, diaSemana: number, horariosIniciais: string[]): Promise<string[]> {
    const cacheKey = getAvailableTimesCacheKey(data);
    
    // Limpar o cache para garantir dados atualizados
    cache.remove(cacheKey);
    
    // Calcular os horários disponíveis diretamente
    try {
      // Buscar todos os agendamentos para a data de uma só vez
      const { data: agendamentosData, error } = await supabase
        .from('agendamentos')
        .select('horario, status')
        .eq('data', data)
        .not('status', 'eq', 'cancelado');
      
      if (error) throw error;
      
      // Extrair horários ocupados dos agendamentos normais
      const horariosOcupadosNormais = agendamentosData.map(a => a.horario);
      console.log(`Horários ocupados normais para ${data}:`, horariosOcupadosNormais);
      
      // Buscar todos os agendamentos recorrentes para o dia da semana de uma só vez
      const { data: agendamentosRecorrentes, error: errorRecorrentes } = await supabase
        .from('recurring_agendamentos')
        .select('horario, status')
        .eq('dia_semana', diaSemana)
        .eq('status', 'ativo');
      
      if (errorRecorrentes) throw errorRecorrentes;
      
      // Extrair horários ocupados dos agendamentos recorrentes
      const horariosOcupadosRecorrentes = agendamentosRecorrentes.map(a => a.horario);
      console.log(`Horários ocupados recorrentes para dia ${diaSemana}:`, horariosOcupadosRecorrentes);
      
      // Verificar horários pendentes
      const horariosPendentes = horariosIniciais.filter(horario => 
        this.verificarHorarioPendente(data, horario)
      );
      console.log(`Horários pendentes para ${data}:`, horariosPendentes);
      
      // Combinar todos os horários ocupados
      const todosHorariosOcupados = [...new Set([
        ...horariosOcupadosNormais, 
        ...horariosOcupadosRecorrentes,
        ...horariosPendentes
      ])];
      
      // Filtrar horários disponíveis diretamente
      const horariosDisponiveis = horariosIniciais.filter(horario => 
        !todosHorariosOcupados.includes(horario)
      );
      
      console.log(`Horários disponíveis para ${data}:`, horariosDisponiveis);
      
      // Não armazenar em cache para evitar problemas de sincronização
      // Sempre consultar o banco de dados diretamente
      
      return horariosDisponiveis;
    } catch (error) {
      console.error('Erro ao obter horários disponíveis:', error);
      
      // Em caso de erro, tentar uma abordagem alternativa mais simples
      try {
        // Verificar agendamentos normais um por um
        const horariosOcupadosNormais: string[] = [];
        const promises = horariosIniciais.map(async (horario) => {
          const disponivel = await this.verificarDisponibilidadeNormal(data, horario);
          if (!disponivel) {
            horariosOcupadosNormais.push(horario);
          }
        });
        await Promise.all(promises);
        
        // Verificar horários pendentes
        const horariosPendentes = horariosIniciais.filter(horario => 
          this.verificarHorarioPendente(data, horario)
        );
        
        // Filtrar horários disponíveis
        const todosHorariosOcupados = [...new Set([...horariosOcupadosNormais, ...horariosPendentes])];
        return horariosIniciais.filter(h => !todosHorariosOcupados.includes(h));
      } catch (fallbackError) {
        console.error('Erro no método alternativo de obter horários:', fallbackError);
        // Em último caso, retornar os horários iniciais
        return horariosIniciais;
      }
    }
  },
  
  // Invalida o cache para um horário específico
  invalidarCache(data: string, horario: string, diaSemana: number): void {
    console.log(`Invalidando cache para ${data} ${horario} (dia ${diaSemana})`);
    
    // Remove os itens específicos do cache
    cache.remove(getNormalCacheKey(data, horario));
    cache.remove(getRecurringCacheKey(diaSemana, horario));
    cache.remove(getAvailableTimesCacheKey(data));
    
    // Remove o horário da lista de pendentes
    this.removerHorarioPendente(data, horario);
    
    // Limpa todo o cache para garantir dados atualizados
    this.limparCache();
    
    console.log('Cache invalidado com sucesso');
  },
  
  // Limpa todo o cache
  limparCache(): void {
    // Limpar completamente o cache
    cache.clear();
    
    // Limpar todos os horários pendentes (não apenas os expirados)
    // para garantir que não haja conflitos
    const pendingCount = pendingBookings.length;
    while (pendingBookings.length > 0) {
      pendingBookings.pop();
    }
    
    console.log(`Cache e horários pendentes completamente limpos (${pendingCount} horários pendentes removidos)`);
  }
};