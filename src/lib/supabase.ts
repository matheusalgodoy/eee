import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const tableName = import.meta.env.VITE_SUPABASE_TABLE_NAME || 'agendamentos';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Credenciais do Supabase não configuradas');
}

// Verificar se as credenciais estão definidas corretamente
console.log('Supabase URL definida:', !!supabaseUrl);
console.log('Supabase Key definida:', !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Verificar se a conexão foi estabelecida corretamente
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('Erro ao conectar com o Supabase:', error);
  } else {
    console.log('Conexão com o Supabase estabelecida com sucesso');
  }
});

// Tipos para os dados do agendamento
export interface Agendamento {
  id: string;
  nome: string;
  telefone: string;
  servico: string;
  data: string;
  horario: string;
  status: 'pendente' | 'confirmado' | 'cancelado';
  created_at?: string;
}

// Funções auxiliares para manipulação de agendamentos
export const agendamentoService = {
  async listarAgendamentos() {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('data', { ascending: true });

    if (error) {
      console.error('Erro ao listar agendamentos:', error);
      throw error;
    }
    return data;
  },
  
  subscribeToAgendamentos(callback: (agendamentos: Agendamento[]) => void) {
    const channel = supabase
      .channel('agendamentos-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: tableName },
        async (payload) => {
          // Quando houver qualquer mudança na tabela, buscar todos os agendamentos atualizados
          const { data } = await supabase
            .from(tableName)
            .select('*')
            .order('data', { ascending: true });
          
          if (data) {
            callback(data);
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  },

  async criarAgendamento(agendamento: Omit<Agendamento, 'id' | 'created_at'>) {
    // Verificar disponibilidade novamente antes de criar o agendamento
    const dataFormatada = agendamento.data.split('T')[0];
    
    // Verificar se já existe algum agendamento no mesmo horário
    const { data: agendamentosExistentes, error: errorConsulta } = await supabase
      .from(tableName)
      .select('*')
      .eq('data', dataFormatada)
      .eq('horario', agendamento.horario)
      .not('status', 'eq', 'cancelado');
      
    if (errorConsulta) {
      console.error('Erro ao verificar disponibilidade:', errorConsulta);
      throw errorConsulta;
    }
    
    // Se encontrou algum agendamento no mesmo horário, não permite criar
    if (agendamentosExistentes && agendamentosExistentes.length > 0) {
      console.error(`Tentativa de criar agendamento em horário já ocupado: ${agendamento.data} ${agendamento.horario}`);
      throw new Error('Este horário não está mais disponível. Por favor, selecione outro.');
    }
    
    const { data, error } = await supabase
      .from(tableName)
      .insert([agendamento])
      .select();

    if (error) {
      console.error('Erro ao criar agendamento:', error);
      throw error;
    }
    
    console.log(`Agendamento criado com sucesso: ${agendamento.data} ${agendamento.horario}`);
    return data[0];
  },

  async atualizarStatus(id: string, status: Agendamento['status']) {
    const { data, error } = await supabase
      .from(tableName)
      .update({ status })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro ao atualizar status:', error);
      throw error;
    }
    return data[0];
  },

  async verificarDisponibilidade(data: string, horario: string) {
    // Consulta mais rigorosa para verificar disponibilidade
    const { data: agendamentos, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('data', data)
      .eq('horario', horario)
      .not('status', 'eq', 'cancelado');

    if (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      throw error;
    }
    
    // Verificar também agendamentos recorrentes
    const dataObj = new Date(data);
    const diaSemana = dataObj.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
    
    const { data: agendamentosRecorrentes, error: errorRecorrentes } = await supabase
      .from('recurring_agendamentos')
      .select('*')
      .eq('dia_semana', diaSemana)
      .eq('horario', horario)
      .eq('status', 'ativo');
      
    if (errorRecorrentes) {
      console.error('Erro ao verificar disponibilidade recorrente:', errorRecorrentes);
      throw errorRecorrentes;
    }
    
    const disponivelNormal = agendamentos.length === 0;
    const disponivelRecorrente = agendamentosRecorrentes.length === 0;
    const disponivel = disponivelNormal && disponivelRecorrente;
    
    console.log(`Verificação no banco: ${data} ${horario} - ${disponivel ? 'Disponível' : 'Indisponível'} (${agendamentos.length} agendamentos normais, ${agendamentosRecorrentes.length} agendamentos recorrentes)`);
    return disponivel;
  }
};