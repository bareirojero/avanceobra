/* eslint-disable react-hooks/refs -- el PanResponder lee las props por ref solo dentro de sus eventos */
import type { Geometria } from '@registro-obra/contrato';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Rect as SvgRect } from 'react-native-svg';

import {
  ancla,
  aNormalizado,
  aNormalizadoLimitado,
  aPantalla,
  encajar,
  geometriaDeGesto,
  marcaEn,
  posicionNumero,
  visibles,
  type Marca,
  type Punto,
  type Rect,
  type Tam,
  type TipoMarca,
} from '@/domain/marcas';
import { acento, color, fuente, marca as tokensMarca } from '@/theme';

interface Props {
  uri: string;
  /** Clave de caché de una imagen remota (la URL firmada cambia en cada pedido). */
  claveCache?: string | null;
  foto: Tam;
  marcas: Marca[];
  activaId?: string | null;
  /** Herramienta para dibujar; sin herramienta la foto solo se mira. */
  herramienta?: TipoMarca | null;
  alCrear?: (g: Geometria) => void;
  alSeleccionar?: (id: string) => void;
  alMover?: (id: string, destino: Punto) => void;
  /** Número más chico para miniaturas. */
  compacta?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Foto con sus marcas dibujadas encima. Con una herramienta elegida: tocar o arrastrar
 * sobre la foto crea una marca, y arrastrar una marca existente la mueve.
 */
export function FotoConMarcas({
  uri,
  claveCache,
  foto,
  marcas,
  activaId,
  herramienta,
  alCrear,
  alSeleccionar,
  alMover,
  compacta,
  style,
}: Props) {
  'use no memo';
  const [contenedor, setContenedor] = useState<Tam>({ ancho: 0, alto: 0 });
  const [borrador, setBorrador] = useState<Geometria | null>(null);
  const rect = useMemo(() => encajar(contenedor, foto), [contenedor, foto]);

  // El PanResponder se crea una vez: lee lo actual por refs.
  const props = useRef({ marcas, herramienta, alCrear, alSeleccionar, alMover, rect, foto });
  props.current = { marcas, herramienta, alCrear, alSeleccionar, alMover, rect, foto };
  const gesto = useRef<
    | { modo: 'mover'; id: string; anclaInicial: Punto; inicio: Punto }
    | { modo: 'dibujar'; trayecto: Punto[] }
    | null
  >(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!props.current.herramienta,
        onMoveShouldSetPanResponder: () => !!props.current.herramienta,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { marcas, rect, alSeleccionar } = props.current;
          const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
          const tocada = marcaEn(marcas, p, rect);
          if (tocada) {
            alSeleccionar?.(tocada.id);
            gesto.current = { modo: 'mover', id: tocada.id, anclaInicial: ancla(tocada.geometria), inicio: p };
            return;
          }
          const n = aNormalizado(p, rect);
          gesto.current = n ? { modo: 'dibujar', trayecto: [n] } : null;
        },
        onPanResponderMove: (e) => {
          const g = gesto.current;
          const { rect, herramienta, foto, alMover } = props.current;
          if (!g || rect.ancho === 0) return;
          const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
          if (g.modo === 'mover') {
            alMover?.(g.id, {
              x: g.anclaInicial.x + (p.x - g.inicio.x) / rect.ancho,
              y: g.anclaInicial.y + (p.y - g.inicio.y) / rect.alto,
            });
          } else if (herramienta) {
            g.trayecto.push(aNormalizadoLimitado(p, rect));
            setBorrador(geometriaDeGesto(g.trayecto, herramienta, foto));
          }
        },
        onPanResponderRelease: () => {
          const g = gesto.current;
          const { herramienta, foto, alCrear } = props.current;
          if (g?.modo === 'dibujar' && herramienta) alCrear?.(geometriaDeGesto(g.trayecto, herramienta, foto));
          gesto.current = null;
          setBorrador(null);
        },
        onPanResponderTerminate: () => {
          gesto.current = null;
          setBorrador(null);
        },
      }),
    [],
  );

  const alMedir = (e: LayoutChangeEvent) =>
    setContenedor({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height });

  const lista = visibles(marcas);
  const tamNumero = compacta ? 24 : tokensMarca.size;

  return (
    <View style={[s.contenedor, style]} onLayout={alMedir}>
      <Image
        source={{ uri, cacheKey: claveCache ?? undefined }}
        style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.ancho, height: rect.alto }}
        contentFit="fill"
        accessibilityIgnoresInvertColors
      />
      {rect.ancho > 0 && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {lista.map((m) => (
            <Forma key={m.id} g={m.geometria} rect={rect} activa={m.id === activaId} compacta={compacta} />
          ))}
          {borrador && <Forma g={borrador} rect={rect} activa compacta={compacta} />}
        </Svg>
      )}
      {rect.ancho > 0 &&
        lista.map((m) => {
          const p = aPantalla(posicionNumero(m.geometria, foto), rect);
          const activa = m.id === activaId;
          return (
            <View
              key={m.id}
              pointerEvents="none"
              style={[
                s.numero,
                {
                  left: p.x - tamNumero / 2,
                  top: p.y - tamNumero / 2,
                  width: tamNumero,
                  height: tamNumero,
                  borderRadius: tamNumero / 2,
                  borderWidth: compacta ? 2 : tokensMarca.border,
                  backgroundColor: activa ? acento : tokensMarca.idle,
                },
              ]}>
              <Text style={[s.textoNumero, compacta && { fontSize: 12 }]}>{m.numero}</Text>
            </View>
          );
        })}
      {herramienta && <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />}
    </View>
  );
}

/** Dibuja la forma dos veces: un contorno oscuro debajo para que se vea sobre cualquier foto. */
function Forma({ g, rect, activa, compacta }: { g: Geometria; rect: Rect; activa: boolean; compacta?: boolean }) {
  const trazo = activa ? acento : '#FFFFFF';
  const grosor = compacta ? 2 : 3;
  const capas = [
    { stroke: color.ink, width: grosor + 3, opacity: 0.55 },
    { stroke: trazo, width: grosor, opacity: 1 },
  ];
  const P = (x: number, y: number) => aPantalla({ x, y }, rect);

  if ('cx' in g) {
    const c = P(g.cx, g.cy);
    return (
      <>
        {capas.map((k, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={g.r * rect.ancho} stroke={k.stroke} strokeWidth={k.width}
            strokeOpacity={k.opacity} strokeDasharray={activa ? '10 6' : undefined} fill="none" />
        ))}
      </>
    );
  }
  if ('w' in g) {
    const a = P(g.x, g.y);
    return (
      <>
        {capas.map((k, i) => (
          <SvgRect key={i} x={a.x} y={a.y} width={g.w * rect.ancho} height={g.h * rect.alto} rx={10}
            stroke={k.stroke} strokeWidth={k.width} strokeOpacity={k.opacity} fill="none" />
        ))}
      </>
    );
  }
  if ('x1' in g) {
    const a = P(g.x1, g.y1);
    const b = P(g.x2, g.y2);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const largo = compacta ? 9 : 18;
    const ala = (giro: number) => ({ x: b.x - largo * Math.cos(ang + giro), y: b.y - largo * Math.sin(ang + giro) });
    const puntos = [b, ala(0.45), ala(-0.45)].map((q) => `${q.x},${q.y}`).join(' ');
    return (
      <>
        {capas.map((k, i) => (
          <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={k.stroke} strokeWidth={k.width}
            strokeOpacity={k.opacity} strokeLinecap="round" />
        ))}
        <Polygon points={puntos} fill={trazo} stroke={color.ink} strokeWidth={1.5} strokeLinejoin="round" />
      </>
    );
  }
  if ('puntos' in g) {
    const puntos = g.puntos.map(([x, y]) => {
      const q = P(x, y);
      return `${q.x},${q.y}`;
    }).join(' ');
    return (
      <>
        {capas.map((k, i) => (
          <Polyline key={i} points={puntos} stroke={k.stroke} strokeWidth={k.width} strokeOpacity={k.opacity}
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </>
    );
  }
  // Punto: el número ya marca el lugar; se agrega un anillo mientras se dibuja.
  return null;
}

const s = StyleSheet.create({
  contenedor: { overflow: 'hidden', backgroundColor: '#000' },
  numero: {
    position: 'absolute',
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoNumero: { fontFamily: fuente.display, fontSize: 18, color: color.ink, includeFontPadding: false },
});
