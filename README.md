# n8n-nodes-do-while

[![npm version](https://badge.fury.io/js/n8n-nodes-do-while.svg)](https://www.npmjs.com/package/n8n-nodes-do-while)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![n8n community node](https://img.shields.io/badge/n8n-community%20node-orange)](https://www.npmjs.com/package/n8n-nodes-do-while)

An n8n community node that brings the missing **do...while loop** to your workflows.

Execute a set of nodes repeatedly until a condition you define is met, then continue. Built for polling APIs, retrying operations, waiting for async jobs, and any workflow that needs to keep running until something becomes true.

---

## The problem this solves

n8n's built-in **Loop Over Items** node iterates over a known list. But what if you do not have a list? What if you need to keep running until something happens?

- A background job finishes processing
- An API returns a specific status
- A database record finally appears
- A retry eventually succeeds

That is a do...while loop. Every programming language has one. n8n did not, until now.

---

## Installation

In your n8n instance go to **Settings > Community Nodes > Install** and enter:

```
n8n-nodes-do-while
```

Or install manually on self-hosted:

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-do-while
```

Restart n8n after installing. The node will appear in the nodes panel as **Do...While**.

---

## How it works

The node has two output pins:

| Pin | When it fires |
|---|---|
| **Condition Met** | Your condition evaluated to true, or max iterations was reached |
| **Loop** | Your condition is false. Connect this to your action nodes and route back into the Do...While input |

```
[Your trigger or previous node]
    |
    v
[Do...While]
    |-- Condition Met --> [continue your workflow]
    |-- Loop ----------> [your action nodes] --> back to [Do...While]
```

Each item passing through gets a `_loop` object injected automatically:

| Field | Type | Description |
|---|---|---|
| `$json._loop.iteration` | number | How many times this item has looped. Starts at 0. |
| `$json._loop.first` | boolean | True on the very first iteration |
| `$json._loop.max` | number | The max iterations you configured |
| `$json._loop.timedOut` | boolean | True when the loop exits because max iterations was reached |

---

## Parameters

| Parameter | Default | Description |
|---|---|---|
| **Condition** | `={{ $json.status === "done" }}` | An n8n expression that must return true to exit the loop |
| **Max Iterations** | 10 | Safety cap to prevent infinite loops |
| **Wait Between Iterations** | 1 second | How long to pause between each loop. Useful for polling. Set to 0 for no delay. |
| **On Max Iterations Reached** | Exit with flag | Exit gracefully via Condition Met pin with `_loop.timedOut = true`, or throw an error |

---

## Examples

### 1. Poll an API until a background job is complete

A common pattern when working with services that process data asynchronously. You start the job, then keep checking its status until it reports as done.

```
[HTTP Request: Start Job]
    |
    v
[Do...While]
condition: {{ $json.status === "complete" }}
wait: 5 seconds
max: 20
    |-- Condition Met --> [HTTP Request: Fetch Results]
    |-- Loop ----------> [HTTP Request: Check Job Status] --> back to [Do...While]
```

The `_loop.timedOut` field lets you handle the case where the job never completes:

```
[Do...While Condition Met]
    |
    v
[IF: {{ $json._loop.timedOut === true }}]
    |-- True  --> [Send alert: Job timed out]
    |-- False --> [Process the results]
```

---

### 2. Retry a failing HTTP request until it succeeds

Useful when calling unreliable third-party APIs that occasionally return errors.

```
[Do...While]
condition: {{ $json.success === true }}
wait: 3 seconds
max: 5
onMax: Throw Error
    |-- Condition Met --> [continue]
    |-- Loop ----------> [HTTP Request: retry the call] --> back to [Do...While]
```

---

### 3. Wait for a database record to appear

Poll a database query until a specific record exists before continuing.

```
[Do...While]
condition: {{ $json.data.length > 0 }}
wait: 10 seconds
max: 12
    |-- Condition Met --> [process the record]
    |-- Loop ----------> [Postgres: SELECT * FROM jobs WHERE id = '123'] --> back to [Do...While]
```

---

### 4. Use with n8n-nodes-globals for configurable thresholds

[n8n-nodes-globals](https://www.npmjs.com/package/n8n-nodes-globals) lets you store global constants across all your workflows. Combine it with Do...While to make your loop thresholds configurable without touching the workflow itself.

```
[Global Constants: get MAX_POLL_ATTEMPTS]
    |
    v
[Set: maxIterations = {{ $json.MAX_POLL_ATTEMPTS }}]
    |
    v
[Do...While]
condition: {{ $json.ready === true }}
max: {{ $json.maxIterations }}
    |-- Condition Met --> [continue]
    |-- Loop ----------> [check status] --> back to [Do...While]
```

Change `MAX_POLL_ATTEMPTS` in your global constants and every workflow using this pattern updates automatically.

---

### 5. Loop with a counter and exit on threshold

Sometimes you want to loop a fixed number of times and do something different on each iteration based on the count.

```
[Set: counter = 0]
    |
    v
[Do...While]
condition: {{ $json._loop.iteration >= 5 }}
wait: 0
    |-- Condition Met --> [finished after 5 iterations]
    |-- Loop ----------> [Code: process iteration $json._loop.iteration] --> back to [Do...While]
```

---

### 6. Polling with exponential backoff using the Code node

For robust production workflows, increase the wait time between retries instead of using a fixed interval. Combine Do...While with a Code node to calculate the delay dynamically.

```
[Do...While]
condition: {{ $json.status === "done" }}
wait: 0
max: 8
    |-- Condition Met --> [continue]
    |-- Loop ---------->
        [Code: calculate backoff]
        // Wait longer on each retry: 1s, 2s, 4s, 8s...
        const delay = Math.pow(2, $json._loop.iteration) * 1000;
        await new Promise(r => setTimeout(r, delay));
        return $input.all();
        |
        v
        [HTTP Request: check status]
        |
        back to [Do...While]
```

---

## The `_loop` metadata reference

Every item that passes through Do...While has `_loop` added to its JSON automatically. You can reference these fields anywhere downstream:

```javascript
// Check iteration count in a condition
={{ $json._loop.iteration < 10 }}

// Only do something on the first pass
={{ $json._loop.first === true }}

// Handle timeout separately from success
={{ $json._loop.timedOut === true }}

// Show progress in a notification
={{ "Attempt " + ($json._loop.iteration + 1) + " of " + $json._loop.max }}
```

---

## Important: wiring the loop back

The **Loop** output pin must connect back to this node's input — directly or via other nodes. Without this connection the workflow ends without looping.

```
Do...While (Loop pin) --> [action nodes] --> Do...While (input)
```

This is by design. You decide exactly what runs inside each iteration.

---

## Handling timeouts gracefully

When max iterations is reached without the condition being met, items exit via the **Condition Met** pin with `_loop.timedOut` set to `true`. Use an IF node to branch based on this:

```
[Do...While: Condition Met]
    |
    v
[IF: {{ $json._loop.timedOut }}]
    |-- True  --> [notify: operation timed out after N attempts]
    |-- False --> [continue normally with the result]
```

Alternatively, set **On Max Iterations Reached** to **Throw Error** if hitting the limit should always stop the workflow.

---

## Compatibility

- n8n version 0.198.0 and above
- Works on self-hosted n8n (Community Edition and Enterprise)
- Works on n8n Cloud (community nodes are supported as of mid-2025)
- No external dependencies

---

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/YOUR_GITHUB_USERNAME/n8n-nodes-do-while).

If you find a bug or want to request a feature, open an issue with a description of what you need and a workflow example if possible.

---

## License

[MIT](LICENSE)

---

## About

Built because n8n's Loop Over Items only works on known lists. For everything else, you need a do...while loop.
