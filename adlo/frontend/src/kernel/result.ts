export type Result<T, E = Error> =
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      error: E;
    };

export function resultOk<T>(value: T): Result<T> {
  return { success: true, value };
}

export function resultErr<E>(error: E): Result<never, E> {
  return { success: false, error };
}
