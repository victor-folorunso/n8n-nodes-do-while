import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

export class DoWhile implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Do...While',
    name: 'doWhile',
    icon: 'fa:sync',
    group: ['transform'],
    version: 1,
    description: 'Execute connected nodes repeatedly until a condition is met — the n8n do...while loop',
    defaults: {
      name: 'Do...While',
    },
    inputs: ['main'],
    outputs: ['main', 'main'],
    outputNames: ['Condition Met', 'Loop'],
    hints: [
      {
        message: 'Connect the <strong>Loop</strong> output to your action nodes, then route them back into this node\'s input. Connect <strong>Condition Met</strong> to whatever should run after the loop finishes.',
        location: 'outputPane',
      },
    ],
    properties: [
      {
        displayName: 'Condition',
        name: 'condition',
        type: 'string',
        typeOptions: {
          rows: 2,
        },
        default: '={{ $json.status === "done" }}',
        description: 'Expression that must evaluate to true to exit the loop. Use $json fields from the data coming back into this node. Also available: $json._loop.iteration, $json._loop.first, $json._loop.max.',
        required: true,
      },
      {
        displayName: 'Max Iterations',
        name: 'maxIterations',
        type: 'number',
        default: 10,
        typeOptions: {
          minValue: 1,
          maxValue: 1000,
        },
        description: 'Safety cap to prevent infinite loops. When reached, items exit via the Condition Met pin with _loop.timedOut set to true.',
      },
      {
        displayName: 'Wait Between Iterations (seconds)',
        name: 'waitSeconds',
        type: 'number',
        default: 1,
        typeOptions: {
          minValue: 0,
          maxValue: 300,
        },
        description: 'How long to pause between each loop iteration. Set to 0 for no delay. Useful when polling an API to avoid hammering the endpoint.',
      },
      {
        displayName: 'On Max Iterations Reached',
        name: 'maxBehavior',
        type: 'options',
        options: [
          {
            name: 'Exit via Condition Met pin (with timeout flag)',
            value: 'exit',
            description: 'Items exit through Condition Met with _loop.timedOut = true so you can handle the timeout gracefully',
          },
          {
            name: 'Throw Error',
            value: 'error',
            description: 'Stop the workflow with an error — useful when hitting max iterations should never happen',
          },
        ],
        default: 'exit',
        description: 'What to do when max iterations is reached without the condition being met',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const maxIterations = this.getNodeParameter('maxIterations', 0) as number;
    const waitSeconds = this.getNodeParameter('waitSeconds', 0) as number;
    const maxBehavior = this.getNodeParameter('maxBehavior', 0) as string;

    const staticData = this.getWorkflowStaticData('node');

    // Initialise iteration counter — resets when condition is met or max reached
    if (staticData.iteration === undefined) {
      staticData.iteration = 0;
    }

    const iteration = staticData.iteration as number;
    const conditionMet: INodeExecutionData[] = [];
    const loop: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      // Inject loop metadata so users can reference it in conditions and downstream nodes
      const itemWithMeta: INodeExecutionData = {
        ...items[i],
        json: {
          ...items[i].json,
          _loop: {
            iteration,
            first: iteration === 0,
            max: maxIterations,
            timedOut: false,
          },
        },
      };

      // Max iterations safety check
      if (iteration >= maxIterations) {
        if (maxBehavior === 'error') {
          throw new NodeOperationError(
            this.getNode(),
            `Do...While reached max iterations (${maxIterations}) without the condition being met.`,
          );
        }

        // Exit gracefully with timedOut flag
        conditionMet.push({
          ...itemWithMeta,
          json: {
            ...itemWithMeta.json,
            _loop: {
              ...(itemWithMeta.json._loop as object),
              timedOut: true,
            },
          },
        });
        staticData.iteration = 0;
        continue;
      }

      // Evaluate the condition expression
      let conditionResult = false;
      try {
        const result = this.evaluateExpression(
          this.getNodeParameter('condition', i) as string,
          i,
        );
        // evaluateExpression can return a string "false" or "true"
        // Boolean("false") === true in JS so strings must be handled explicitly
        if (typeof result === 'string') {
          conditionResult = result === 'true' || result === '1';
        } else {
          conditionResult = Boolean(result);
        }
      } catch (error) {
        throw new NodeOperationError(
          this.getNode(),
          `Condition expression error: ${(error as Error).message}`,
        );
      }

      if (conditionResult) {
        // Condition met — exit loop and reset state
        conditionMet.push(itemWithMeta);
        staticData.iteration = 0;
      } else {
        // Condition not met — wait then send back through loop
        if (waitSeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        }
        staticData.iteration = iteration + 1;
        loop.push(itemWithMeta);
      }
    }

    return [conditionMet, loop];
  }
}
