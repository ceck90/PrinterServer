import { Client } from "pg";
import { gsg_queries } from "../gsg-helper";

export class StatisticsController {
  constructor(private readonly pgClient: Client) {}

  /**
   * GET /api/statistics/totals
   * Query: gsg_queries.totali
   * Returns: { ordini, incasso_totale, scontrino_medio, totale_coperto, totale_asporto }
   */
  async getTotals(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.totali, [startDate, endDate]);
      return result.rows[0] || {
        ordini: 0,
        incasso_totale: 0,
        scontrino_medio: 0,
        totale_coperto: 0,
        totale_asporto: 0
      };
    } catch (error) {
      console.error("[Statistics] Error fetching totals:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/trend
   * Query: gsg_queries.trendOrario
   * Returns: [{ ora, ordini, incasso }]
   */
  async getTrend(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.trendOrario, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching trend:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/by-area
   * Query: gsg_queries.perArea
   * Returns: [{ area, ordini, incasso }]
   */
  async getByArea(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.perArea, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching by area:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/by-payment
   * Query: gsg_queries.perPagamento
   * Returns: [{ tipo_pagamento, ordini, incasso }]
   */
  async getByPayment(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.perPagamento, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching by payment:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/channel
   * Query: gsg_queries.piazzaVsAsporto
   * Returns: [{ canale: 'PIAZZA'|'ASPORTO', ordini, incasso }]
   */
  async getChannel(startDate: string, endDate: string) {
    try {
      // console.log("[Statistics] getChannel called with:", { startDate, endDate });
      // console.log("[Statistics] startDate type:", typeof startDate, "value:", startDate);
      // console.log("[Statistics] endDate type:", typeof endDate, "value:", endDate);
      
      // Test query to check if there's ANY data in the date range
      const testQuery = `SELECT COUNT(*) as total, MIN(serata) as min_serata, MAX(serata) as max_serata FROM ordini WHERE serata BETWEEN $1 AND $2`;
      const testResult = await this.pgClient.query(testQuery, [startDate, endDate]);
      // console.log("[Statistics] Test query result:", testResult.rows[0]);
      
      // Check all ordini in general
      const allCheck = await this.pgClient.query(`SELECT COUNT(*) as total, MIN(serata) as min_serata, MAX(serata) as max_serata FROM ordini`);
      // console.log("[Statistics] All ordini:", allCheck.rows[0]);
      
      // console.log("[Statistics] Query:", gsg_queries.piazzaVsAsporto);
      const result = await this.pgClient.query(gsg_queries.piazzaVsAsporto, [startDate, endDate]);
      // console.log("[Statistics] getChannel result rows:", result.rows);
      // console.log("[Statistics] getChannel row count:", result.rowCount);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching channel:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/top-products
   * Query: gsg_queries.topArticoli
   * Returns: [{ descrizione, pezzi }]
   */
  async getTopProducts(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.topArticoli, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching top products:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/top-categories
   * Query: gsg_queries.topAggregati
   * Returns: [{ aggregato, pezzi }]
   */
  async getTopCategories(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.topAggregati, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching top categories:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/by-cashier
   * Query: gsg_queries.perCassiere
   * Returns: [{ cassiere, ordini, incasso }]
   */
  async getByCashier(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.perCassiere, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching by cashier:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/by-table
   * Query: gsg_queries.perTavolo
   * Returns: [{ numeroTavolo, n_ordini, incasso }]
   */
  async getByTable(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.perTavolo, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching by table:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/departments
   * Query: gsg_queries.statiReparto
   * Returns: [{ reparto, stato, ordini }]
   */
  async getDepartments(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.statiReparto, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error("[Statistics] Error fetching departments:", error);
      throw error;
    }
  }

  /**
   * GET /api/statistics/total-covers
   * Query: gsg_queries.totaleCoperti
   * Returns: { totale_coperti }
   */
  async getTotalCovers(startDate: string, endDate: string) {
    try {
      const result = await this.pgClient.query(gsg_queries.totaleCoperti, [startDate, endDate]);
      return result.rows[0] || { totale_coperti: 0 };
    } catch (error) {
      console.error("[Statistics] Error fetching total covers:", error);
      throw error;
    }
  }
}
