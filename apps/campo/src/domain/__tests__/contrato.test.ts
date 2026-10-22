import { idParte } from '@registro-obra/contrato';

describe('idParte', () => {
  it('da el mismo id para la misma persona, obra y día, en cualquier teléfono', () => {
    const a = idParte('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000010', '2026-10-21');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idParte('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000010', '2026-10-21')).toBe(a);
    expect(idParte('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000010', '2026-10-22')).not.toBe(a);
  });
});
