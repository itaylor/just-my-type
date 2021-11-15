
import { MetaModel, StrategyHints, UnionStrategyOpts, OptionalStrategyOpts, ConcreteMetaModel } from './types.ts';
import observeOne from './strategies.ts';
import { printType } from './printModel.ts';
import { createMetaModel } from './utils.ts';

type TypeGenOptions = (StrategyHints | UnionStrategyOpts | OptionalStrategyOpts) & {
  observeType?: 'eager' | 'lazy' 
};
export default class TypeGenerator {
  typeName: string;
  modelsByKey: Record<string, MetaModel>;
  observationCache: Record<string, ConcreteMetaModel>;
  options: TypeGenOptions;
  constructor(typeName: string, options: TypeGenOptions = { observeType: 'lazy', strategyHints: {}, defaultObjectStrategy: 'union', recordConversionThreshold: 10 }) {
    this.typeName = typeName;
    this.options = options;
    this.observationCache = {};
    if (!options.observeType) {
      options.observeType = 'lazy';
    }
    this.modelsByKey = {};
  }
  observe(thing: unknown) {
    const cm: ConcreteMetaModel = createMetaModel(this.typeName, thing);
    if (this.options.observeType === 'eager') {
      // update the model right now.
      observeOne(cm, this.modelsByKey, this.options);
    } else {
      //put the model into a cache to observe later.
      //by keying it on JSON, we can somewhat cheaply eliminate any 100% duplicates without traversing the whole model to determine equality for things like records or maps
      this.observationCache[JSON.stringify(cm)] = cm;
    }
  }
  processModel() {
    const vs = Object.values(this.observationCache);
    vs.forEach(v => observeOne(v, this.modelsByKey, this.options));
    this.observationCache = {};
  }
  readCurrentModel() {
    this.processModel();
    return this.modelsByKey[this.typeName];
  }
  suggest() {
    this.processModel();
    const mm = this.modelsByKey[this.typeName];
    const output = `export type ${safeName(this.typeName)} = ${printType(mm, 0)}`;
    return output;
  }
}

function safeName(str: string) {
  return str.split(/[\W_]+/g).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}