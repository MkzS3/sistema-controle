import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { Inject, Injectable } from '@nestjs/common';
import { SQS_CLIENT } from '../sqs/sqs-client.token.js';
import { SqsQueueManager } from '../sqs/sqs-queue-manager.js';
import { DIVIDEND_COMMAND_TYPES, DividendCommandType } from './command-envelope.js';

export interface CommandToPublish {
  messageId: string;
  correlationId?: string;
  type: DividendCommandType;
  data: Record<string, unknown>;
}

@Injectable()
export class SqsCommandPublisher {
  constructor(
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    private readonly queues: SqsQueueManager,
  ) {}

  async publish(command: CommandToPublish): Promise<{ brokerMessageId: string }> {
    if (!command.messageId.trim() || !DIVIDEND_COMMAND_TYPES.includes(command.type)) {
      throw new TypeError('A command requires a stable messageId and a supported command type.');
    }
    const queues = await this.queues.ensureQueues();
    const correlationId = command.correlationId?.trim() || command.messageId;
    const result = await this.sqs.send(new SendMessageCommand({
      QueueUrl: queues.command,
      MessageBody: JSON.stringify({ ...command, correlationId }),
      MessageAttributes: {
        correlationId: { DataType: 'String', StringValue: correlationId },
        commandType: { DataType: 'String', StringValue: command.type },
      },
    }));
    if (!result.MessageId) throw new Error('SQS accepted the command without returning a broker message ID.');
    return { brokerMessageId: result.MessageId };
  }
}
