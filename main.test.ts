import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.109.0/testing/asserts.ts";
import TypeGenerator, { ArrayMetaModel } from './main.ts';

(Deno.test as unknown) = async (name: string, fn: () => void) => {
  // Debugger doesn't working with `deno test` right now.
  console.log(name);
  await fn();
  console.log(`${name} ok`);
};

const object1 = {
  str: 'string',
  num: 9,
  bool: true,
  dynamicProp: 'string'
};
const object2 = {
  str: 'AnotherString',
  num: 1,
  bool: false,
  dynamicProp: 5,
  extraProp: true
}
const object3 = {
  str: 'thirdString',
  num: 1,
  bool: false,
  dynamicProp: true
}
const object4 = {
  str: 'obj4',
  num: 12,
  bool: false,
  dynamicProp: 'val'
}

Deno.test('Basic object type test', async () => {
  
  const tg = new TypeGenerator('BasicObject');
  tg.observe(object1);
  tg.observe(object2);
  tg.observe(object3);
  tg.observe(object4);
  console.log(tg.readCurrentModel());
  assertEquals(tg.readCurrentModel().length, 3);
  const type = tg.suggest();

  const code = `
  ${type}
  const object1: BasicObject = ${JSON.stringify(object1)};
  const object2: BasicObject = ${JSON.stringify(object2)};
  const object3: BasicObject = ${JSON.stringify(object3)};
  const object4: BasicObject = ${JSON.stringify(object4)};
  `
  await tseval(code);

  const code2 = `
  ${type}
  const object1: BasicObject = ${JSON.stringify(object1)};
  const object2: BasicObject = { junk: true, shouldFail: true };
  `
  const error = await getExpectedError(() => tseval(code2));
  assertExists(error);
  assertStringIncludes(error?.message, `Type '{ junk: boolean; shouldFail: boolean; }' is not assignable to type 'BasicObject'.`);
  //console.log('finished ok!');
})

Deno.test('Basic array type test', async () => {
  const tg = new TypeGenerator('BasicArray');
  tg.observe([object1, object2]);
  tg.observe([object3, object4]);
  console.log(tg.readCurrentModel());
  assertEquals(tg.readCurrentModel().length, 1);
  assertEquals((tg.readCurrentModel()[0] as ArrayMetaModel).items.length, 3);
  const type = tg.suggest();

  const code = `
  ${type}
  const object1 = ${JSON.stringify(object1)};
  const object2 = ${JSON.stringify(object2)};
  const object3 = ${JSON.stringify(object3)};
  const object4 = ${JSON.stringify(object4)};
  const arr1: BasicArray = [object1, object2];
  const arr2: BasicArray = [object3, object4];
  const arr3: BasicArray = [object1, object2, object3, object4];
  `
  await tseval(code);

  const code2 = `
  ${type}
  const object1 = ${JSON.stringify(object1)};
  const object2 = { junk: true, shouldFail: true };
  const arr1: BasicArray = [object1, object2];
  `
  const error = await getExpectedError(() => tseval(code2));
  assertExists(error);
  assertStringIncludes(error?.message, `Type '{ junk: boolean; shouldFail: boolean; }' is not assignable to type `);
  //console.log('finished ok!');
})

Deno.test('Nested array object test', async () => {
  const tg = new TypeGenerator('NestedArrayObject');

  const testObject1 = {
    startIndex: 0,
    maxReturn: 100,
    items: [
      {
        type: 'coords',
        children: [
          { x: 0, y: 100},
          { x: 10, y: 90},
          { x: 200, y: 5},
        ]
      },
      {
        type: 'message',
        messageText: 'This is message1',
      },
      { 
        type: 'coords',
        children: [
          { x: 100, y: 0 },
          { x: 200, y: 40 },
          { x: 55, y: 300},
        ]
      },
      { 
        type: 'message', 
        messageText: 'This is message2',
      }
    ]
  }
  const testObject2 = {
    startIndex: 3,
    maxReturn: 50,
    items: [
      {
        type: 'message',
        messageText: 'This is message3',
      },
      {
        type: 'message',
        messageText: 'This is message3',
      }
    ]
  }
  const testObject3 = {
    startIndex: 0,
    maxReturn: 3,
    items: [
      {
        type: 'responses',
        responses: ['Yes', 'No'],
      },
      {
        type: 'responses',
        responses: ['Sometimes', 'Never']
      }
    ]
  }
  tg.observe(testObject1);
  tg.observe(testObject2);
  tg.observe(testObject3);
  console.log(tg.readCurrentModel());
  //assertEquals(tg.readCurrentModel().length, 1);
  //assertEquals((tg.readCurrentModel()[0] as any).model.items.length, 3);
  const type = tg.suggest();
  console.log(type);

  const code = `
  ${type}
  const object1: NestedArrayObject = ${JSON.stringify(testObject1)};
  const object2: NestedArrayObject = ${JSON.stringify(testObject2)};
  const object3: NestedArrayObject = ${JSON.stringify(testObject3)};
  `
  await tseval(code);

  const code2 = `
  ${type}
  const object1: NestedArrayObject = ${ JSON.stringify(testObject1) }
  const object2: NestedArrayObject = ${ JSON.stringify(testObject2)};
  const object3: NestedArrayObject = ${ JSON.stringify({
    startIndex: 0,
    maxReturn: 3,
    items: [
      {
        type: 'responses',
        responses: null
      }
    ]
  })};`

  const error = await getExpectedError(() => tseval(code2));
  assertExists(error);
  assertStringIncludes(error?.message, `Type 'null' is not assignable to type 'string[]'`);
  //console.log('finished ok!');
})

function tseval(code: string) {
  return import('data:application/typescript;base64,' + btoa(code));
}
async function getExpectedError(fn: () => Promise<Error | undefined>): Promise<Error | undefined>{
  try {
    await fn();
  } catch (e) {
    return e;
  }
  return undefined;
}