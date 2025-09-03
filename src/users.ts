// security/password.ts
import { Algorithm, hash, verify  } from "@node-rs/argon2";

/**
 * Genera un hash Argon2id (salt incluso nell'output).
 * Salva SOLO l'hash nel DB.
 */
export async function hashPassword(plain: string): Promise<string> {
  // parametri robusti; puoi aumentare in base alla macchina
  console.log("[PASSWORD] Hashing password");
  return hash(plain, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,   // ~19 MB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifica una password contro l'hash salvato.
 */
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  var result = await verify(hashed, plain);
  console.log("[PASSWORD] Verifying password result:", result);
  return result;
}
