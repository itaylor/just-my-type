
import { MetaModel, SuggestOptions, StrategyHints, UnionStrategyOpts, OptionalStrategyOpts } from './types.ts';
import observeOne from './Strategies.ts';
import { printType } from './printModel.ts';

type TypeGenOptions = StrategyHints | UnionStrategyOpts | OptionalStrategyOpts;
export default class TypeGenerator {
  typeName: string;
  modelsByKey: Record<string, MetaModel>;
  options: TypeGenOptions;
  constructor(typeName: string, options: TypeGenOptions = { strategyHints: {}, defaultObjectStrategy: 'union', recordConversionThreshold: 10 }) {
    this.typeName = typeName;
    this.options = options;
    this.modelsByKey = {};
  }
  observe(thing: unknown) {
    observeOne(this.typeName, thing, this.modelsByKey, this.options);
  }
  readCurrentModel() {
    return this.modelsByKey[this.typeName];
  }
  suggest() {
    const mm = this.modelsByKey[this.typeName];
    const output = `export type ${safeName(this.typeName)} = ${printType(mm, 0)}`;
    return output;
  }
}

function safeName(str: string) {
  return str.split(/[\W_]+/g).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}