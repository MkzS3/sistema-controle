import { SQSClient, type SQSClientConfig } from '@aws-sdk/client-sqs';

export function createSqsClient(): SQSClient {
  const config: SQSClientConfig = {
    region: process.env.AWS_REGION ?? 'us-east-1',
  };

  const endpoint = process.env.AWS_ENDPOINT_URL;
  if (endpoint) {
    config.endpoint = endpoint;
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }

  return new SQSClient(config);
}
