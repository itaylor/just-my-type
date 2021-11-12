import { MetaModel, SuggestOptions, ObjectMetaModel, ArrayMetaModel } from './types.ts';



export function printType(mm: MetaModel, depth: number): string {
  return mm.map((cm) => {
    if (cm.type === 'object') {
      return printObject(cm, depth);
    }
    if (cm.type === 'array') {
      return printArray(cm, depth);
    }
    return cm.type;
  }).join(' | ');
}

// function collapseAllObjectModels(k: string, mm: MetaModel, options: SuggestOptions) {
//   const mergeStrategy = options.objectMergeStrategyOverrides[k] || options.defaultObjectMergeStrategy;
//   if (mergeStrategy === 'union') {
//     return mm;
//   }
//   const newMms: MetaModel = [];
//   let onlyObject: ObjectMetaModel | undefined = undefined;
//   for (const cm of mm) {
//     if (cm.type === 'object') {
//       if (!onlyObject) {
//         onlyObject = cm;
//       } else {
//         onlyObject = collapseObjectModels(onlyObject, cm, options);
//       }
//     } else {
//       newMms.push(cm);
//     }
//   }
//   if (onlyObject) {
//     newMms.push(onlyObject);
//   }
//   return newMms;
// }

function printObject(om: ObjectMetaModel, depth: number): string {
  const keys = Object.keys(om.model);

  const eachKey = keys.map((k) => {
    const isOptional = om.optionals[k] ? '?' : '';
    const nextType = printType(om.model[k], depth + 1);
    return `${k}${isOptional}: ${nextType}`;
  });
  return `{\n${printDepth(depth + 1)}${eachKey.join(',\n' + printDepth(depth + 1))}\n${printDepth(depth)}}`;
}
function printDepth(depth: number) {
  let str = '';
  for (let i = 0; i < depth; i++) {
    str += '  ';
  }
  return str;
}

function printArray(am: ArrayMetaModel, depth: number) {
  if (am.items.length === 0) {
    return `Array<unknown>`;
  }
  return `Array<${printType(am.items, depth)}>`
}