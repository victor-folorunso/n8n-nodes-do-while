# n8n-nodes-do-while

[![npm version](https://badge.fury.io/js/n8n-nodes-do-while.svg)](https://www.npmjs.com/package/n8n-nodes-do-while)
[![npm downloads](https://img.shields.io/npm/dm/n8n-nodes-do-while.svg)](https://www.npmjs.com/package/n8n-nodes-do-while)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![n8n community node](https://img.shields.io/badge/n8n-community%20node-orange)](https://www.npmjs.com/package/n8n-nodes-do-while)

The missing **while loop** for n8n. Loop between nodes, poll APIs, retry requests, and wait for conditions — all without writing a single line of code.

If you have ever searched for "while loop n8n", "how to loop until condition in n8n", "polling loop n8n", or "how to retry HTTP request until success in n8n" — this node is the answer.

---

## The problem

n8n has a Loop Over Items node, but it only iterates over a known list. There is no native while loop. There is no way to keep running a set of nodes until a condition is true.

This comes up constantly:

- You need to poll an API every few seconds until a job finishes
- You need to retry a failing HTTP request until it succeeds
- You need to wait for a database record to appear before continuing
- You need to loop between nodes — not over items — until something changes
- You need recursion-like behavior without writing recursive code

The usual workarounds are fragile. People wire together IF nodes, Wait nodes, and Code nodes to fake a while loop. It works until it does not. This node replaces all of that with a single clean solution.

---

## What it does

**n8n-nodes-do-while** is a while loop node for n8n. It executes your connected nodes repeatedly — looping between them — until a condition you define evaluates to true. When the condition is met, the loop exits and your workflow continues.

It is the equivalent of this in code:

```javascript
do {
  result = checkStatus();
} while (result.status !== 'done');

continueWorkflow(result);
```

But visual, in n8n, with no code required.

---

## Installation

In your n8n instance go to **Settings > Community Nodes > Install** and search for:

```
n8n-nodes-do-while
```

Or install manually on self-hosted n8n:

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-do-while
```

Restart n8n after installing. The node appears in the panel as **Do...While**.

---

## How to wire it up

The node has two output pins:

| Pin | When items exit here |
|---|---|
| **Condition Met** | Your condition evaluated to true, or max iterations was reached |
| **Loop** | Your condition is false — connect this to your action nodes and route back into this node's input |

```
[previous node]
    |
    v
[Do...While]  <-----------------------------------------+
    |                                                    |
    |-- Condition Met --> [continue your workflow]       |
    |                                                    |
    |-- Loop --> [your action nodes] --------------------+
```

This is a while loop between nodes. Items keep circulating through the Loop pin until the condition is true, then exit through Condition Met.

---

## Parameters

| Parameter | Default | Description |
|---|---|---|
| **Condition** | `={{ $json.status === "done" }}` | Standard n8n expression. Evaluated against the data coming back into the node on each iteration. When true, exits via Condition Met. |
| **Max Iterations** | 10 | Safety cap. Prevents infinite loops. When hit, items exit via Condition Met with `_loop.timedOut = true`. |
| **Wait Between Iterations** | 1 second | Pause between each loop. Set to 5 or 10 seconds when polling slow APIs. Set to 0 for immediate retry logic. |
| **On Max Iterations Reached** | Exit with flag | Exit gracefully (timedOut flag) or throw an error. |

---

## Loop metadata

Every item passing through the node gets a `_loop` object injected automatically. Use these fields in your condition or in downstream nodes:

| Field | Type | Description |
|---|---|---|
| `$json._loop.iteration` | number | How many times this item has looped. Starts at 0. |
| `$json._loop.first` | boolean | True on the very first iteration. Useful for initialising state. |
| `$json._loop.max` | number | The max iterations you configured. |
| `$json._loop.timedOut` | boolean | True when the loop exits because max iterations was reached without the condition being met. |

---

## Use cases and examples

These are the real scenarios people search for. Each one is a direct use of this while loop node.

---

### 1. While loop: poll an API until a job is complete

The most common use case. You trigger a long-running job — video encoding, report generation, AI processing, file conversion — and need to keep checking its status until it reports as done.

This replaces the "how do I build a polling loop in n8n" workaround.

```
[HTTP Request: start the job]
    |
    v
[Do...While]
condition: {{ $json.status === "complete" }}
wait: 5 seconds
max iterations: 20
    |
    |-- Condition Met --> [HTTP Request: fetch the result]
    |
    |-- Loop --> [HTTP Request: GET /jobs/{id}/status] --> back to Do...While
```

Real examples this solves:
- Poll D-ID API until a video is ready (`status === "done"`)
- Poll OpenAI Batch API until processing is complete (`status === "completed"`)
- Poll Google TTS Long Audio API until audio is ready (`done === true`)
- Poll Replicate API until an image is generated (`status === "succeeded"`)
- Poll any async API that returns a job ID and a status field

---

### 2. While loop: retry an HTTP request until it succeeds

Retry logic in n8n without code. Keep calling an endpoint until it returns a successful response, then continue. Stop after a configurable number of attempts.

This replaces "how to retry HTTP request until success n8n".

```
[Do...While]
condition: {{ $json.success === true }}
wait: 3 seconds
max iterations: 5
on max: Throw Error
    |
    |-- Condition Met --> [continue workflow]
    |
    |-- Loop --> [HTTP Request: retry the call] --> back to Do...While
```

---

### 3. While loop: wait for a database record to appear

You are waiting for a record to be created by another system before your workflow can continue. Poll the database every 10 seconds until the record exists.

This replaces "how to loop between nodes until condition is met n8n".

```
[Do...While]
condition: {{ $json.data !== null && $json.data.length > 0 }}
wait: 10 seconds
max iterations: 18
    |
    |-- Condition Met --> [process the record]
    |
    |-- Loop --> [Postgres: SELECT * FROM orders WHERE id = '123'] --> back to Do...While
```

---

### 4. While loop: loop until a counter reaches a threshold

Run a set of nodes a specific number of times based on a counter, not a fixed list. The while loop equivalent of a for loop when you do not have items to iterate over.

```
[Set: counter = 0]
    |
    v
[Do...While]
condition: {{ $json._loop.iteration >= 5 }}
wait: 0
    |
    |-- Condition Met --> [finished]
    |
    |-- Loop --> [Code: do something on iteration {{ $json._loop.iteration }}] --> back to Do...While
```

---

### 5. While loop: conditional retry with recursion-like behaviour

Implement recursion-like looping in n8n without recursive subworkflow calls. Run a node, check the result, and loop back if it does not meet your threshold.

This replaces "how to implement recursion looping for HTTP requests in n8n".

```
[Do...While]
condition: {{ $json.score >= 0.9 }}
wait: 1 second
max iterations: 10
    |
    |-- Condition Met --> [use the result]
    |
    |-- Loop --> [HTTP Request: regenerate] --> back to Do...While
```

---

### 6. While loop: wait for an AI job to finish processing

OpenAI deep research, Anthropic batch jobs, and other AI APIs are asynchronous. Start the job, then loop until the result is ready.

```
[HTTP Request: start AI job]
    |
    v
[Do...While]
condition: {{ $json.status === "completed" }}
wait: 10 seconds
max iterations: 30
    |
    |-- Condition Met --> [parse and use the AI result]
    |
    |-- Loop --> [HTTP Request: GET /batches/{id}] --> back to Do...While
```

---

### 7. Handle a timeout gracefully

When the job never finishes, you need to know and act on it. Use an IF node after the Condition Met pin to branch based on `_loop.timedOut`.

```
[Do...While: Condition Met]
    |
    v
[IF: {{ $json._loop.timedOut === true }}]
    |
    |-- True  --> [send alert: operation timed out after {{ $json._loop.max }} attempts]
    |
    |-- False --> [continue normally with the result]
```

---

### 8. Use with n8n-nodes-globals for configurable thresholds

Combine with [n8n-nodes-globals](https://www.npmjs.com/package/n8n-nodes-globals) to store your polling intervals and max attempt counts as global constants. Change them once and every workflow using this pattern updates automatically.

```
[Global Constants: get POLL_INTERVAL and MAX_ATTEMPTS]
    |
    v
[Do...While]
condition: {{ $json.ready === true }}
wait: {{ $json.POLL_INTERVAL }}
max: {{ $json.MAX_ATTEMPTS }}
```

---

## Frequently asked questions

**How is this different from the Loop Over Items node?**
Loop Over Items iterates over a known list of items. Do...While loops until a condition is true regardless of how many items you have. Use Loop Over Items when you have a list. Use Do...While when you have a condition.

**How do I implement a while loop in n8n?**
Install this node. Set your condition. Connect the Loop pin to your action nodes and route them back into this node's input. That is your while loop.

**How do I poll an API until it returns a specific status in n8n?**
Use this node. Set the condition to check the status field (e.g. `{{ $json.status === "done" }}`), set a wait interval, and connect your HTTP Request node to the Loop pin.

**How do I retry an HTTP request until it succeeds in n8n?**
Use this node. Set the condition to `{{ $json.success === true }}` or whatever your API returns on success. Connect your HTTP Request node to the Loop pin with a short wait.

**How do I loop between nodes in n8n until a condition is met?**
This is exactly what this node does. Connect the Loop pin to whatever nodes should run on each iteration and route the output back into this node's input.

**Will this cause an infinite loop?**
No. The Max Iterations parameter is a hard cap. When hit, items exit through the Condition Met pin with `_loop.timedOut = true`. Set On Max Iterations Reached to Throw Error if you want the workflow to stop instead.

**Does this work on n8n Cloud?**
Yes, as a community node. Go to Settings > Community Nodes > Install and search for `n8n-nodes-do-while`.

---

## Important: wiring the loop back

The **Loop** output pin must connect back to this node's input — directly or via other nodes. Without this connection the workflow ends after the first check without looping.

```
Do...While (Loop pin) --> [your action nodes] --> Do...While (input)
```

---

## Compatibility

- n8n version 0.198.0 and above
- Self-hosted n8n (Community Edition and Enterprise)
- n8n Cloud (community nodes supported)
- No external dependencies

---

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/victor-folorunso/n8n-nodes-do-while).

If you find a bug or want to request a feature, open an issue with a description of what you need and a workflow example if possible.

---

## License

[MIT](LICENSE)

---

## About

Built because n8n's Loop Over Items only works on known lists. For everything else — polling, retrying, waiting, conditional looping between nodes — you need a while loop. Now n8n has one.
