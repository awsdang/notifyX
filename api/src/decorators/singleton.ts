type AnyConstructor = new (...args: any[]) => object;

export function singleton<TBase extends AnyConstructor>(Base: TBase): TBase {
  let instance: InstanceType<TBase> | null = null;

  class Singleton extends Base {
    constructor(...args: any[]) {
      if (instance) {
        return instance;
      }

      super(...(args as ConstructorParameters<TBase>));
      instance = this as InstanceType<TBase>;
      return instance;
    }
  }

  return Singleton as TBase;
}
