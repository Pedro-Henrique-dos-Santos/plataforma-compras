import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { type z, ZodError } from 'zod';

export class ZodValidationPipe<TSchema extends z.ZodType>
  implements PipeTransform<unknown, z.output<TSchema>>
{
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (!(error instanceof ZodError)) {
        throw error;
      }

      const messages = error.issues.map((issue) => {
        const field = issue.path.join('.');
        return field ? `${field}: ${issue.message}` : issue.message;
      });
      throw new BadRequestException(messages);
    }
  }
}
