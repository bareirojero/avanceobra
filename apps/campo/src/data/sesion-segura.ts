import * as SecureStore from 'expo-secure-store';

/**
 * Tokens de la sesión en el almacén cifrado del teléfono. SecureStore admite valores de
 * hasta unos 2 KB y un JWT puede pasarlos, así que el valor se parte en pedazos.
 */
const TAMANO = 1800;
// SecureStore solo acepta letras, números, ".", "-" y "_" en las claves.
const clave = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const almacenSeguro = {
  async getItem(k: string): Promise<string | null> {
    const n = await SecureStore.getItemAsync(`${clave(k)}.n`);
    if (n === null) return null;
    const partes: string[] = [];
    for (let i = 0; i < Number(n); i++) {
      const p = await SecureStore.getItemAsync(`${clave(k)}.${i}`);
      if (p === null) return null;
      partes.push(p);
    }
    return partes.join('');
  },

  async setItem(k: string, valor: string): Promise<void> {
    await this.removeItem(k);
    const n = Math.ceil(valor.length / TAMANO);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${clave(k)}.${i}`, valor.slice(i * TAMANO, (i + 1) * TAMANO));
    }
    await SecureStore.setItemAsync(`${clave(k)}.n`, String(n));
  },

  async removeItem(k: string): Promise<void> {
    const n = await SecureStore.getItemAsync(`${clave(k)}.n`);
    if (n === null) return;
    await SecureStore.deleteItemAsync(`${clave(k)}.n`);
    for (let i = 0; i < Number(n); i++) await SecureStore.deleteItemAsync(`${clave(k)}.${i}`);
  },
};
