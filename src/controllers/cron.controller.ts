import cron, { ScheduledTask, schedule, validate } from "node-cron";
import { EventEmitter } from "events";
import type { JobDefinition, JobId, JobInfo, UpdateJobInput } from "../types";

/**
 * Controller Singleton dei cron jobs.
 * - CRUD completo
 * - Pause/Resume/RunNow
 * - Preview prossime esecuzioni (best-effort)
 * - Graceful shutdown
 */
export class JobController extends EventEmitter {
  private static instance: JobController | null = null;

  // Mappa jobId -> ScheduledTask + metadata
  private jobs = new Map<JobId, {
    task: ScheduledTask;
    info: Omit<JobInfo, "running" | "nextRuns"> & { running: boolean; lastRunAt?: Date; };
    runner: () => Promise<void> | void;
  }>();

  private constructor() {
    super();
    // process.on("SIGINT", () => this.stopAll());
    // process.on("SIGTERM", () => this.stopAll());
  }

  public static getInstance(): JobController {
    if (!JobController.instance) {
      JobController.instance = new JobController();
    }
    return JobController.instance;
  }

  /** Crea e registra un job */
  public create(def: JobDefinition): JobInfo {
    if (this.jobs.has(def.id)) {
      throw new Error(`Job '${def.id}' esiste già`);
    }
    if (!validate(def.cron)) {
      throw new Error(`CRON '${def.cron}' non valido`);
    }

    const runner = async () => {
      const entry = this.jobs.get(def.id);
      if (!entry) return;
      entry.info.running = true;
      this.emit("job:start", def.id);
      try {
        await Promise.resolve(def.task());
        entry.info.lastRunAt = new Date();
        this.emit("job:success", def.id, entry.info.lastRunAt);
      } catch (err) {
        this.emit("job:error", def.id, err);
      } finally {
        entry.info.running = false;
        this.emit("job:end", def.id);
      }
    };

    const task = schedule(def.cron, runner, {
      timezone: def.timezone,
    });

    const info: JobInfo = {
      id: def.id,
      name: def.name,
      cron: def.cron,
      timezone: def.timezone,
      enabled: def.enabled !== false,
      running: false,
      lastRunAt: undefined,
      meta: def.meta,
      nextRuns: undefined,
    };

    this.jobs.set(def.id, { task, info, runner });

    if (def.startNow) void this.runNow(def.id);
    return this.get(def.id)!;
  }

  /** Read: ottieni info di un job */
  public get(id: JobId): JobInfo | undefined {
    const entry = this.jobs.get(id);
    if (!entry) return undefined;
    return {
      ...entry.info,
      running: entry.info.running,
      // node-cron non espone nativamente future run; lascio undefined o potresti calcolarle con un parser CRON esterno
      nextRuns: undefined,
    };
  }

  /** List: elenco jobs */
  public list(): JobInfo[] {
    return [...this.jobs.values()].map(e => this.get(e.info.id)!);
  }

  /** Update: cambia cron/timezone/task/meta/enabled */
  public update(id: JobId, update: UpdateJobInput): JobInfo {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`Job '${id}' non trovato`);

    // Se cambiano cron/timezone/task, dobbiamo rischedulare
    const needsReschedule = Boolean(update.cron || update.timezone || update.task);

    if (needsReschedule) {
      // stop vecchio task
      entry.task.stop();

      const newCron = update.cron ?? entry.info.cron;
      if (!validate(newCron)) {
        throw new Error(`CRON '${newCron}' non valido`);
      }
      const newRunner = update.task ?? entry.runner;

      const newTask = schedule(newCron, newRunner, {
        timezone: update.timezone ?? entry.info.timezone
      });

      entry.task = newTask;
      entry.runner = newRunner;
      entry.info.cron = newCron;
      entry.info.timezone = update.timezone ?? entry.info.timezone;
    }

    if (typeof update.enabled === "boolean") {
      entry.info.enabled = update.enabled;
      update.enabled ? entry.task.start() : entry.task.stop();
    }

    if (update.meta) {
      entry.info.meta = { ...(entry.info.meta ?? {}), ...update.meta };
    }

    return this.get(id)!;
  }

  /** Delete: rimuovi un job */
  public remove(id: JobId): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;
    try {
      entry.task.stop();
      // @ts-ignore: node-cron ha .destroy() nelle ultime versioni
      if (typeof (entry.task as any).destroy === "function") {
        (entry.task as any).destroy();
      }
    } finally {
      this.jobs.delete(id);
      this.emit("job:removed", id);
    }
    return true;
  }

  /** Pause */
  public pause(id: JobId): void {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`Job '${id}' non trovato`);
    entry.task.stop();
    entry.info.enabled = false;
    this.emit("job:paused", id);
  }

  /** Resume */
  public resume(id: JobId): void {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`Job '${id}' non trovato`);
    entry.task.start();
    entry.info.enabled = true;
    this.emit("job:resumed", id);
  }

  /** Run ad-hoc fuori schedule */
  public async runNow(id: JobId): Promise<void> {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`Job '${id}' non trovato`);
    await Promise.resolve(entry.runner());
  }

  /** Ferma tutti i job (graceful shutdown) */
  public stopAll(): void {
    for (const [id, entry] of this.jobs.entries()) {
      try {
        entry.task.stop();
      } catch {}
    }
    this.emit("[JOB CONTROLLER] Shutdown");
  }
}
