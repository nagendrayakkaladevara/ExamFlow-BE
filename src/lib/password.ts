type Argon2Module = typeof import('argon2');

let argon2Module: Argon2Module | undefined;

async function loadArgon2(): Promise<Argon2Module> {
  if (!argon2Module) {
    const mod = await import('argon2');
    argon2Module = mod.default ?? mod;
  }
  return argon2Module;
}

/** Hash a plaintext password with argon2id. */
export async function hashPassword(password: string): Promise<string> {
  const argon2 = await loadArgon2();
  return argon2.hash(password, { type: argon2.argon2id });
}

/** Verify a plaintext password against an argon2 hash. */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    const argon2 = await loadArgon2();
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
