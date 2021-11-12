import { arrayCompare, objectCompare } from './compare.ts';
import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.109.0/testing/asserts.ts";
import { BasicMetaModel, ArrayMetaModel, ObjectMetaModel } from './types.ts'


const str1: BasicMetaModel = {
  type: 'string',
  name: 'str1',
}

const num1: BasicMetaModel = {
  type: 'number',
  name: 'num1'
}

const obj1: ObjectMetaModel = {
  name: 'obj1',
  optionals: {},
  type: 'object',
  model: {
    foo: [str1, num1]
  }
}

const obj2: ObjectMetaModel = {
  name: 'obj2',
  optionals: {},
  type: 'object',
  model: {
    bar: [num1]
  }
}

const ar1: ArrayMetaModel = {
  type: 'array',
  name: 'ar1',
  items: [obj1]
}


Deno.test('Array Comparison on matching Models', () => {
  const ar2: ArrayMetaModel = {
    type: 'array',
    name: 'ar2',
    items: [{ ...obj1 }]
  }
  const result = arrayCompare(ar1, ar2);
  assertEquals(result.exactMatch, true);
  assertEquals(result.diff, 0);
  assertEquals(result.unMatchedItems.length, 0);
});

Deno.test('Array Comparison on unmatched Models', () => {
  const ar2: ArrayMetaModel = {
    type: 'array',
    name: 'ar2',
    items: [obj2]
  }
  const result = arrayCompare(ar1, ar2);
  assertEquals(result.exactMatch, false);
  assertEquals(result.diff, 1);
  assertEquals(result.unMatchedItems.length, 1);
  assertEquals(result.unMatchedItems[0], obj1);
});


Deno.test('Array Comparison on matching Models when subset of models match', () => {
  const ar2: ArrayMetaModel = {
    type: 'array',
    name: 'ar2',
    items: [obj2, { ...obj1 }]
  }
  const result = arrayCompare(ar1, ar2);
  assertEquals(result.exactMatch, true);
  assertEquals(result.diff, 0);
  assertEquals(result.unMatchedItems.length, 0);
});

Deno.test('Array Comparison on unmatched Models when there are multiple models', () => {
  const obj3: ObjectMetaModel = {
    name: 'obj3',
    optionals: {},
    type: 'object',
    model: {
      baz: [str1, num1],
      bar: [num1]
    }
  }
  const ar2: ArrayMetaModel = {
    type: 'array',
    name: 'ar2',
    items: [obj2, obj3]
  }
  const result = arrayCompare(ar1, ar2);
  assertEquals(result.exactMatch, false);
  assertEquals(result.diff, 1);
  assertEquals(result.unMatchedItems.length, 1);
  assertEquals(result.unMatchedItems[0], obj1);
});


Deno.test('Nested Array Test', () => {
  const ar2: ArrayMetaModel = {
    type: 'array',
    name: 'ar2',
    items: [{
      type: 'array',
      name: 'ar3',
      items: [{...obj1}]
    }]
  }
  const ar4: ArrayMetaModel = {
    type: 'array',
    name: 'ar4',
    items: [{
      type: 'array',
      name: 'ar5',
      items: [str1, num1, { ...obj1 }]
    }]
  }
  const result = arrayCompare(ar2, ar4);
  assertEquals(result.exactMatch, true);
  assertEquals(result.diff, 0);
  assertEquals(result.unMatchedItems.length, 0);
});

Deno.test('Nested Array Test with unmatched arrays', () => {
  
  const ar2: ArrayMetaModel = {
    type: 'array',
    name: 'ar2',
    items: [{
      type: 'array',
      name: 'ar3',
      items: [obj1]
    }]
  }
  const ar4: ArrayMetaModel = {
    type: 'array',
    name: 'ar4',
    items: [{
      type: 'array',
      name: 'ar5',
      items: [str1, num1, { ...obj2 }]
    }]
  }
  const result = arrayCompare(ar2, ar4); 
  assertEquals(result.exactMatch, false);
  assertEquals(result.diff, 1);
  assertEquals(result.unMatchedItems.length, 1);
  assertEquals(result.unMatchedItems[0], {
    type: 'array',
    name: 'ar3',
    items: [obj1]
  });
})

Deno.test('Object comparison, same object', () => {
  const result = objectCompare(obj1, {...obj1});
  assertEquals(result.compatibleType, true);
  assertEquals(result.exactMatch, true);
  assertEquals(result.diff, 0);
  assertEquals(result.unMatchedKeys.length, 0);
});

Deno.test('Object comparison, different objects', () => {
  const result = objectCompare(obj1, obj2);
  assertEquals(result.compatibleType, true);
  assertEquals(result.exactMatch, false);
  assertEquals(result.diff, 1);
  assertEquals(result.unMatchedKeys.length, 1);
  assertEquals(result.unMatchedKeys[0], 'foo');
});


