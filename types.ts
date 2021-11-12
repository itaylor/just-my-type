
export type StrategyHints = {
  defaultObjectStrategy: MergeStrategy,
  strategyHints: Record<string, MergeStrategy>,
}
export type UnionStrategyOpts = StrategyHints & {
  recordConversionThreshold: number,
}
export type OptionalStrategyOpts = StrategyHints & {
  recordConversionThreshold: number,
  objectDiffThreshold: number,
}

export type TypeContext = Record<string, MetaModel>;


export type CompareMatch = {
  exactMatch: boolean,
  diff: number,
  compatibleType: boolean,
}

export type MetaModel = Array<ConcreteMetaModel>;
export type ConcreteMetaModel = BasicMetaModel | ObjectMetaModel | ArrayMetaModel | RecordMetaModel;

export type BasicType = 'string' | 'boolean' | 'number' | 'bigint' | 'symbol' | 'function' | 'undefined' | 'null';
export type CompoundType = 'array' | 'object' | 'record';

export type BasicMetaModel = {
  name: string,
  type: BasicType
}

export type ArrayMetaModel = {
  name: string,
  type: 'array';
  items: MetaModel;
}

export type ObjectMetaModel = {
  name: string,
  type: 'object';
  model: Record<string, MetaModel>;
  optionals: Record<string, boolean>;
}

export type RecordMetaModel = {
  name: string,
  type: 'record',
  keys: (BasicType | CompoundType)[]  // todo: maybe should be string | symbol | number instead of all types?
  values: MetaModel
}

export type MergeStrategy = 'union' | 'optional' | 'record';
export type SuggestOptions = {
  defaultObjectMergeStrategy: MergeStrategy;
  objectMergeStrategyOverrides: Record<string, MergeStrategy>
}

export type MatchModel = { model: ConcreteMetaModel, diff: number, existing: boolean }

