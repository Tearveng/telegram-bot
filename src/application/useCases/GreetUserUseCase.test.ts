import { GreetUserUseCase } from './GreetUserUseCase';
import { InMemoryUserRepo } from '../../infrastructure/persistence/InMemoryUserRepo';

test('greet user first time', async () => {
  const repo = new InMemoryUserRepo();
  const useCase = new GreetUserUseCase(repo);

  const resp = await useCase.execute('12345');
  expect(resp.text).toBe('Hello! 👋');
});