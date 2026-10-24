import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProveedorApp, useApp } from '@/state/app';
import { color } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function Raiz() {
  const [fuentes] = useFonts({ Archivo_700Bold, Archivo_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  return (
    <SafeAreaProvider>
      <ProveedorApp>
        <StatusBar style="dark" />
        {fuentes && <Navegacion />}
      </ProveedorApp>
    </SafeAreaProvider>
  );
}

function Navegacion() {
  const { cargando, sesion } = useApp();

  useEffect(() => {
    if (!cargando) SplashScreen.hideAsync();
  }, [cargando]);

  if (cargando) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }}>
      <Stack.Protected guard={!!sesion}>
        <Stack.Screen name="(pestanas)" />
        <Stack.Screen name="camara" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="foto/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="foto-anterior" options={{ animation: 'fade' }} />
        <Stack.Screen name="pedido" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="obras" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reingresar" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!sesion}>
        <Stack.Screen name="ingresar" />
      </Stack.Protected>
    </Stack>
  );
}
