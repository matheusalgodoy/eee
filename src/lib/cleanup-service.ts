import { supabase } from './supabase';
import { format, subDays } from 'date-fns';

// Serviço para limpeza automática de agendamentos
export const cleanupService = {
  /**
   * Remove agendamentos cancelados do banco de dados
   * @returns Número de agendamentos removidos
   */
  async removerAgendamentosCancelados() {
    try {
      const { data, error, count } = await supabase
        .from('agendamentos')
        .delete()
        .eq('status', 'cancelado')
        .select('id');

      if (error) {
        console.error('Erro ao remover agendamentos cancelados:', error);
        throw error;
      }

      console.log(`${count} agendamentos cancelados foram removidos`);
      return count || 0;
    } catch (error) {
      console.error('Erro ao remover agendamentos cancelados:', error);
      throw error;
    }
  },

  /**
   * Remove agendamentos que já passaram há mais de um dia
   * @returns Número de agendamentos removidos
   */
  async removerAgendamentosExpirados() {
    try {
      // Calcula a data limite (ontem)
      const dataLimite = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      const { data, error, count } = await supabase
        .from('agendamentos')
        .delete()
        .lt('data', dataLimite)
        .select('id');

      if (error) {
        console.error('Erro ao remover agendamentos expirados:', error);
        throw error;
      }

      console.log(`${count} agendamentos expirados foram removidos`);
      return count || 0;
    } catch (error) {
      console.error('Erro ao remover agendamentos expirados:', error);
      throw error;
    }
  },

  /**
   * Executa a limpeza completa do banco de dados
   * Remove agendamentos cancelados e expirados
   * @returns Objeto com o número de agendamentos removidos por categoria
   */
  async executarLimpeza() {
    try {
      const canceladosRemovidos = await this.removerAgendamentosCancelados();
      const expiradosRemovidos = await this.removerAgendamentosExpirados();

      return {
        cancelados: canceladosRemovidos,
        expirados: expiradosRemovidos,
        total: canceladosRemovidos + expiradosRemovidos
      };
    } catch (error) {
      console.error('Erro ao executar limpeza de agendamentos:', error);
      throw error;
    }
  }
};