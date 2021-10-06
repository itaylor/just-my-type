# just_my_type

*Experimental!!!*

Attempts to infer a typescript type by inspecting runtime javascript objects. 

## Why would I want this?
* You have a large API that is not currently typed
* There are no/poor specifications or documentation of what the shape of the objects it returns
* The responses it return vary, and it's difficult to know that you have a complete understanding of what it can return
* You want to write a type for it

## How to use:
The idea is that you want to run this on a real-world system, observing the real-world data for a while, then after some time has passed and you've observed many responses, you ask it to suggest a type that will match for all of them.

For each object you'd want to generate a type for, you'd create an instance of `TypeGenerator` then call `observe`, passing the data that you're wanting to generate a type for.  After some time has passed and you think you have a complete understanding of what the API does, you'd call `suggest` and it'll make you a `typescript` type that fits the observed data.

## Setup (node.js):
```sh
npm install @itaylor/just-my-type
```
```ts
import TypeGenerator from '@itaylor/just_my_type';
```

## Setup (deno):
```ts
import TypeGenerator from 'https://deno.land/x/just_my_type@0.0.1/main.ts';
```

## Usage
```ts
const tg = new TypeGenerator('MyAPI');

// Assumption: this api is being called by your application somewhere on a regular basis.
export async function myApi() {
  const data = await (await fetch('https://someserver.local/myApiThatINeedATypeFor/')).json();
  tg.observe(data);
  return data;
}
// This is a bad way to do this, but illustrates the point that `observe` should be called multiple times 
// With all the different variations that need to be observed before calling `suggest`
setInterval(() => console.log(tg.suggest()), 5 * 60 * 1000);
```
Every 5 minutes you'd see something like this in the logs that would be the current representation of all the data that has been observed:
```ts
export type MyAPI = {
  startIndex: number,
  maxReturn: number,
  items: Array<{
    type: string,
    children: Array<{
      x: number,
      y: number
    }>
  } | {
    type: string,
    messageText: string
  } | {
    type: string,
    responses: Array<string>
  }>
}
```
