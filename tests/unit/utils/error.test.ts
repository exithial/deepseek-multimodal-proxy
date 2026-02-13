import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../../../src/utils/error';

describe('getErrorMessage', () => {
  it('debe extraer mensaje de Error nativo', () => {
    const error = new Error('Error de prueba');
    expect(getErrorMessage(error)).toBe('Error de prueba');
  });

  it('debe extraer mensaje de TypeError', () => {
    const error = new TypeError('Tipo inválido');
    expect(getErrorMessage(error)).toBe('Tipo inválido');
  });

  it('debe retornar string directamente', () => {
    expect(getErrorMessage('mensaje simple')).toBe('mensaje simple');
  });

  it('debe extraer mensaje de objeto con propiedad message', () => {
    const error = { message: 'error personalizado' };
    expect(getErrorMessage(error)).toBe('error personalizado');
  });

  it('debe convertir a string objetos sin message', () => {
    expect(getErrorMessage({ foo: 'bar' })).toBe('[object Object]');
  });

  it('debe manejar null', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('debe manejar undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('debe manejar números', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('debe manejar booleanos', () => {
    expect(getErrorMessage(true)).toBe('true');
    expect(getErrorMessage(false)).toBe('false');
  });

  it('debe manejar objetos Error personalizados', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('error personalizado');
    expect(getErrorMessage(error)).toBe('error personalizado');
  });

  it('debe manejar objetos con message no string', () => {
    const error = { message: 123 };
    expect(getErrorMessage(error)).toBe('123');
  });
});
