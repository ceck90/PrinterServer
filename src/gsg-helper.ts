// gsg-helper.ts
// Raccolta di query PostgreSQL per statistiche sugli ordini
// by ceck90

export const gsg_queries = {
    // 1) Totali e KPI generali
    totali: `
    WITH base AS (
      SELECT *
      FROM ordini
      WHERE serata BETWEEN $1 AND $2
    )
    SELECT
      COUNT(*)                             AS ordini,
      COALESCE(SUM(totalePagato), 0)::numeric AS incasso_totale,
      AVG(NULLIF(totalePagato,0))          AS scontrino_medio,
      COALESCE(SUM(totale_coperto), 0)     AS totale_coperto,
      COALESCE(SUM(totale_asporto), 0)     AS totale_asporto
    FROM base;
  `,

    // 2) Breakdown per area
    perArea: `
    SELECT area, COUNT(*) AS ordini, SUM(totalePagato) AS incasso
    FROM ordini
    WHERE serata BETWEEN $1 AND $2
    GROUP BY area
    ORDER BY incasso DESC;
  `,

    // 3) Trend orario
    trendOrario: `
    SELECT
      date_trunc('hour', (data + COALESCE(ora,'00:00')::time)) AS ora,
      COUNT(*)                         AS ordini,
      SUM(totalePagato)                AS incasso
    FROM ordini
    WHERE serata BETWEEN $1 AND $2
    GROUP BY 1
    ORDER BY 1;
  `,

    // 4) Tipologia pagamento
    perPagamento: `
    SELECT tipo_pagamento, COUNT(*) AS ordini, SUM(totalePagato) AS incasso
    FROM ordini
    WHERE serata BETWEEN $1 AND $2
    GROUP BY tipo_pagamento
    ORDER BY incasso DESC;
  `,

    // 5) Dine-in vs Asporto
    salaVsAsporto: `
    SELECT
    CASE WHEN COALESCE(esportazione) = true THEN 'ASPORTO' ELSE 'SALA' END AS canale,
    COUNT(*) AS ordini,
    SUM("totalePagato") AS incasso
    FROM ordini
    WHERE serata BETWEEN '2025-01-01' AND '2025-09-30'
    GROUP BY 1
    ORDER BY incasso DESC;
  `,

    // 6) Top articoli venduti
    topArticoli: `
    SELECT
      r.descrizione,
      SUM(r.quantita) AS pezzi
    FROM righe r
    JOIN ordini o ON o.id = r.id_ordine
    WHERE o.serata BETWEEN $1 AND $2
    GROUP BY r.descrizione
    ORDER BY pezzi DESC
    LIMIT 50;
  `,

    // 7) Top categorie/aggregati
    topAggregati: `
    SELECT
      r.aggregato,
      SUM(r.quantita) AS pezzi
    FROM righe r
    JOIN ordini o ON o.id = r.id_ordine
    WHERE o.serata BETWEEN $1 AND $2
    GROUP BY r.aggregato
    ORDER BY pezzi DESC;
  `,

    // 8) Performance per cassiere
    perCassiere: `
    SELECT cassiere, COUNT(*) AS ordini, SUM(totalePagato) AS incasso
    FROM ordini
    WHERE serata BETWEEN $1 AND $2
    GROUP BY cassiere
    ORDER BY incasso DESC;
  `,

    // 9) Performance per tavolo
    perTavolo: `
    SELECT numeroTavolo, COUNT(*) AS n_ordini, SUM(totalePagato) AS incasso
    FROM ordini
    WHERE serata BETWEEN $1 AND $2
    GROUP BY numeroTavolo
    ORDER BY incasso DESC;
  `,

    // 10) Stato per reparto
    statiReparto: `
    SELECT
      'cucina'    AS reparto, stato_cucina    AS stato, COUNT(*) AS ordini
    FROM ordini WHERE serata BETWEEN $1 AND $2 AND stato_cucina    IS NOT NULL
    GROUP BY 1,2
    UNION ALL
    SELECT 'pizzeria', stato_pizzeria, COUNT(*)
    FROM ordini WHERE serata BETWEEN $1 AND $2 AND stato_pizzeria IS NOT NULL
    GROUP BY 1,2
    UNION ALL
    SELECT 'bar', stato_bar, COUNT(*)
    FROM ordini WHERE serata BETWEEN $1 AND $2 AND stato_bar IS NOT NULL
    GROUP BY 1,2
    UNION ALL
    SELECT 'rosticceria', stato_rosticceria, COUNT(*)
    FROM ordini WHERE serata BETWEEN $1 AND $2 AND stato_rosticceria IS NOT NULL
    GROUP BY 1,2
    ORDER BY reparto, stato;
  `,

    // 🔹 Conteggio dei vari articoli
    articoliCount: `
    SELECT
      r.descrizione       AS articolo,
      SUM(r.quantita)     AS pezzi_venduti
    FROM righe r
    JOIN ordini o ON o.id = r.id_ordine
    WHERE o.serata BETWEEN $1 AND $2
    GROUP BY r.descrizione
    ORDER BY pezzi_venduti DESC;
  `,

    // 🔹 Totale dei coperti
    totaleCoperti: `
    SELECT
      COALESCE(SUM(o.coperti), 0) AS totale_coperti
    FROM ordini o
    WHERE o.serata BETWEEN $1 AND $2;
  `,

    // 🔹 Elenco articoli (id + descrizione)
    elencoArticoli: `
    SELECT
      a.id,
      a.descrizione,
      a.descrizionebreve,
      t.descrizione AS tipologia    FROM articoli a
    INNER JOIN tipologie t ON a.id_tipologia = t.id
    ORDER BY t.descrizione;
  `,

  // 🔹 Righe di un ordine specifico
  righePerOrdineConTipologia: `
    SELECT
      r.id,
      r.id_ordine,
      r.quantita,
      r.descrizione,
      r.descrizionebreve,
      r.aggregato,
      t.id            AS id_tipologia,
      t.descrizione   AS tipologia
    FROM righe r
    LEFT JOIN articoli a
      ON a.descrizionebreve = r.descrizionebreve
    LEFT JOIN tipologie t
      ON t.id = a.id_tipologia
    WHERE r.id_ordine = $1
    ORDER BY r.id;
  `,

  // 🔹 Righe di ordini non ancora processati (esempio per coda)
  righePerOrdineConTipologiaUnprocessed: `
    SELECT
      r.id,
      r.id_ordine,
      r.quantita,
      r.descrizione,
      r.descrizionebreve,
      r.aggregato,
      t.id            AS id_tipologia,
      t.descrizione   AS tipologia
    FROM righe r
    LEFT JOIN articoli a
      ON a.descrizionebreve = r.descrizionebreve
    LEFT JOIN tipologie t
      ON t.id = a.id_tipologia
    WHERE r.id_ordine = $1
    ORDER BY r.id;
  `,

};
