import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { Inject, Injectable } from '@nestjs/common';
import { SQS_CLIENT } from './sqs-client.token.js';
import { loadMessagingConfig } from './sqs-config.js';

export interface SqsQueueUrls {
  command: string;
  commandDlq: string;
  events: string;
  eventDlq: string;
}

@Injectable()
export class SqsQueueManager {
  private queueUrls: SqsQueueUrls | undefined;

  constructor(@Inject(SQS_CLIENT) private readonly client: SQSClient) {}

  async ensureQueues(): Promise<SqsQueueUrls> {
    if (this.queueUrls) return this.queueUrls;

    const config = loadMessagingConfig();
    const commandDlq = await this.createOrGet(config.commandDlqName);
    const eventDlq = await this.createOrGet(config.eventDlqName);
    const command = await this.createOrGet(config.commandQueueName);
    const events = await this.createOrGet(config.eventQueueName);

    await Promise.all([
      this.configureRedrive(command, commandDlq, config.maxReceiveCount, config.visibilityTimeoutSeconds),
      this.configureRedrive(events, eventDlq, config.maxReceiveCount, config.visibilityTimeoutSeconds),
    ]);

    this.queueUrls = {
      command: command.url,
      commandDlq: commandDlq.url,
      events: events.url,
      eventDlq: eventDlq.url,
    };
    return this.queueUrls;
  }

  private async createOrGet(name: string): Promise<{ url: string; arn: string }> {
    const created = await this.client.send(new CreateQueueCommand({
      QueueName: name,
      Attributes: { MessageRetentionPeriod: '1209600' },
    }));
    const url = created.QueueUrl;
    if (!url) throw new Error(`SQS did not return a queue URL for ${name}.`);
    const attributes = await this.client.send(new GetQueueAttributesCommand({
      QueueUrl: url,
      AttributeNames: ['QueueArn'],
    }));
    const arn = attributes.Attributes?.QueueArn;
    if (!arn) throw new Error(`SQS did not return an ARN for ${name}.`);
    return { url, arn };
  }

  private async configureRedrive(
    source: { url: string },
    deadLetter: { arn: string },
    maxReceiveCount: number,
    visibilityTimeoutSeconds: number,
  ): Promise<void> {
    await this.client.send(new SetQueueAttributesCommand({
      QueueUrl: source.url,
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadLetter.arn,
          maxReceiveCount: String(maxReceiveCount),
        }),
        VisibilityTimeout: String(visibilityTimeoutSeconds),
        ReceiveMessageWaitTimeSeconds: '20',
      },
    }));
  }
}
