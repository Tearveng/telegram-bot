"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const GreetUserUseCase_1 = require("./GreetUserUseCase");
const InMemoryUserRepo_1 = require("../../infrastructure/persistence/InMemoryUserRepo");
test('greet user first time', async () => {
    const repo = new InMemoryUserRepo_1.InMemoryUserRepo();
    const useCase = new GreetUserUseCase_1.GreetUserUseCase(repo);
    const resp = await useCase.execute('12345');
    expect(resp.text).toBe('Hello! 👋');
});
//# sourceMappingURL=GreetUserUseCase.test.js.map