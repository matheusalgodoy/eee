import { supabase } from './supabase';

export interface RecurringAgendamento {
  id: string;
  nome: string;
  telefone: string;
  servico: string;
  dia_semana: number;
  horario: string;
  status: 'ativo' | 'inativo';
  created_at: string;
}

export const recurringAgendamentoService = {
  async listarAgendamentos() {
    const { data, error } = await supabase
      .from('recurring_agendamentos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as RecurringAgendamento[];
  },

  async criarAgendamento(agendamento: Omit<RecurringAgendamento, 'id' | 'created_at'>) {
    const { data, error } = await supabase
      .from('recurring_agendamentos')
      .insert([agendamento])
      .select()
      .single();

    if (error) throw error;
    return data as RecurringAgendamento;
  },

  async atualizarStatus(id: string, status: 'ativo' | 'inativo') {
    const { data, error } = await supabase
      .from('recurring_agendamentos')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as RecurringAgendamento;
  },

  async verificarDisponibilidade(dia_semana: number, horario: string) {
    console.log(`Verificando disponibilidade recorrente para dia ${dia_semana} às ${horario}`);
    
    try {
      const { data, error } = await supabase
        .from('recurring_agendamentos')
        .select('*')
        .eq('dia_semana', dia_semana)
        .eq('horario', horario)
        .eq('status', 'ativo');

      if (error) {
        console.error('Erro ao verificar disponibilidade recorrente:', error);
        throw error;
      }
      
      const disponivel = (data?.length ?? 0) === 0;
      console.log(`Resultado da verificação recorrente para dia ${dia_semana} às ${horario}: ${disponivel ? 'Disponível' : 'Indisponível'} (${data?.length ?? 0} agendamentos encontrados)`);
      return disponivel;
    } catch (error) {
      console.error('Erro ao verificar disponibilidade recorrente:', error);
      throw error;
    }
  },

  async deletarAgendamento(id: string) {
    const { error } = await supabase
      .from('recurring_agendamentos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};