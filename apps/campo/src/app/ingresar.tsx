import { NOMBRE_APP } from '@registro-obra/contrato';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrincipal, Texto } from '@/components/base';
import { backend, ErrorDeIngreso } from '@/data/backend';
import { leerAjuste } from '@/data/db';
import { ErrorSinConexion } from '@/domain/cola';
import { useApp } from '@/state/app';
import { color, fuente } from '@/theme';

export default function Ingresar() {
  const { ingresar } = useApp();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const campoContrasena = useRef<ComponentRef<typeof TextInput>>(null);
  const demo = backend().modo === 'demo';

  // Se recuerda el último usuario: el capataz solo escribe la contraseña.
  useEffect(() => {
    void leerAjuste('ultimo_usuario').then((u) => u && setUsuario(u));
  }, []);

  async function entrar() {
    setError(null);
    setEntrando(true);
    try {
      await ingresar(usuario, contrasena);
    } catch (e) {
      if (e instanceof ErrorDeIngreso) setError(e.message);
      else if (e instanceof ErrorSinConexion) setError('Para entrar la primera vez hace falta señal. Probá de nuevo cuando tengas.');
      else setError('No se pudo entrar. Probá de nuevo.');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <SafeAreaView style={s.pantalla}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
          <Image
            source={require('@/assets/images/logotipo.png')}
            style={s.logo}
            contentFit="contain"
            accessibilityLabel={NOMBRE_APP}
          />
          <View style={{ gap: 6 }}>
            <Texto v="hero">Hola</Texto>
            <Texto style={{ color: color.inkSoft }}>Entrá con el usuario y la contraseña que te dio el editor.</Texto>
          </View>

          <View style={{ gap: 8 }}>
            <Texto v="etiqueta">Usuario</Texto>
            <TextInput
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              returnKeyType="next"
              onSubmitEditing={() => campoContrasena.current?.focus()}
              style={s.campo}
              placeholder="Tu usuario"
              placeholderTextColor={color.muted}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Texto v="etiqueta">Contraseña</Texto>
            <TextInput
              ref={campoContrasena}
              value={contrasena}
              onChangeText={setContrasena}
              secureTextEntry
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={entrar}
              style={s.campo}
              placeholderTextColor={color.muted}
            />
          </View>

          {error && (
            <View style={s.error} accessibilityLiveRegion="assertive">
              <Texto style={{ color: color.dangerText, fontFamily: fuente.bodySemi }}>{error}</Texto>
            </View>
          )}
          {demo && (
            <Texto v="nota">
              Modo de prueba: no hay servidor configurado. Entrá con cualquier usuario y contraseña; lo que cargues queda en
              este teléfono.
            </Texto>
          )}
        </ScrollView>
        <View style={s.pie}>
          <BotonPrincipal texto="Entrar" onPress={entrar} cargando={entrando} disabled={!usuario.trim() || !contrasena} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  contenido: { padding: 24, gap: 22, paddingTop: 48 },
  logo: { width: 240, height: 49 },
  campo: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.line,
    backgroundColor: color.surface,
    paddingHorizontal: 16,
    fontFamily: fuente.body,
    fontSize: 18,
    color: color.ink,
  },
  error: { backgroundColor: color.dangerSoft, borderRadius: 12, padding: 14 },
  pie: { padding: 16 },
});
