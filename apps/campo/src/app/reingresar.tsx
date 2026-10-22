import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrincipal, Texto } from '@/components/base';
import { backend, ErrorDeIngreso } from '@/data/backend';
import { sesionRenovada } from '@/data/sincronizacion';
import { ErrorSinConexion } from '@/domain/cola';
import { useApp } from '@/state/app';
import { color, fuente } from '@/theme';

/**
 * La sesión del teléfono venció (por ejemplo, el editor cambió la contraseña). Se vuelve a
 * escribir la contraseña sin cerrar sesión, así no se pierde nada de lo que espera envío.
 */
export default function Reingresar() {
  const { sesion } = useApp();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    if (!sesion) return;
    setError(null);
    setEntrando(true);
    try {
      const nueva = await backend().iniciarSesion(sesion.usuario, clave);
      if (nueva.usuarioId !== sesion.usuarioId) throw new ErrorDeIngreso();
      sesionRenovada();
      router.back();
    } catch (e) {
      if (e instanceof ErrorDeIngreso) setError('La contraseña no es correcta. Si la cambiaron, pedísela al editor.');
      else if (e instanceof ErrorSinConexion) setError('Hace falta señal para entrar. Probá de nuevo cuando tengas.');
      else setError('No se pudo entrar. Probá de nuevo.');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <SafeAreaView style={s.pantalla}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Texto v="titulo">Volvé a escribir tu contraseña</Texto>
            <Texto style={{ color: color.inkSoft }}>
              Lo que cargaste está guardado en el teléfono y se envía apenas entres.
            </Texto>
          </View>
          <View style={{ gap: 8 }}>
            <Texto v="etiqueta">Contraseña de {sesion?.usuario}</Texto>
            <TextInput
              value={clave}
              onChangeText={setClave}
              secureTextEntry
              autoFocus
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={entrar}
              style={s.campo}
            />
          </View>
          {error && (
            <View style={s.error} accessibilityLiveRegion="assertive">
              <Texto style={{ color: color.dangerText, fontFamily: fuente.bodySemi }}>{error}</Texto>
            </View>
          )}
        </ScrollView>
        <View style={s.pie}>
          <BotonPrincipal texto="Entrar" onPress={entrar} cargando={entrando} disabled={!clave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  contenido: { padding: 24, gap: 22 },
  campo: {
    minHeight: 56, borderRadius: 12, borderWidth: 2, borderColor: color.line, backgroundColor: color.surface,
    paddingHorizontal: 16, fontFamily: fuente.body, fontSize: 18, color: color.ink,
  },
  error: { backgroundColor: color.dangerSoft, borderRadius: 12, padding: 14 },
  pie: { padding: 16 },
});
