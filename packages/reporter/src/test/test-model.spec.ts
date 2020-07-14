import Err from '../errors/err-model'
import _ from 'lodash'
import TestModel, { TestProps, UpdatableTestProps } from './test-model'
import CommandModel, { CommandProps } from '../commands/command-model'
import { RouteProps } from '../routes/route-model'
import { RunnablesStore } from '../runnables/runnables-store'
import { AgentProps } from '../agents/agent-model'

const createTest = (props: Partial<TestProps> = {}, store = {}) => {
  const defaults = {
    currentRetry: 0,
    id: 'r3',
    prevAttempts: [],
    state: null,
    hooks: [],
  } as TestProps

  return new TestModel(_.defaults(props, defaults), 0, store as RunnablesStore)
}
const createCommand = (props: Partial<CommandProps> = {}) => {
  const defaults = {
    instrument: 'command',
    hookName: '',
    id: 1,
    hookId: 'r3',
    numElements: 1,
    testCurrentRetry: 0,
    testId: 'r3',
    timeout: 4000,
    wallClockStartedAt: new Date().toString(),

  } as CommandProps

  return _.defaults(props, defaults)
}

describe('Test model', () => {
  context('.state', () => {
    it('is the "state" when it exists', () => {
      const test = createTest({ state: 'passed' })

      expect(test.state).to.equal('passed')
    })

    it('is active when there is no state and isActive is true', () => {
      const test = createTest()

      test.lastAttempt.isActive = true
      expect(test.state).to.equal('active')
    })

    it('is processing when there is no state and isActive is falsey', () => {
      const test = createTest()

      expect(test.state).to.equal('processing')
    })
  })

  context('.isLongRunning', () => {
    it('start out not long running', () => {
      const test = createTest()

      expect(test.isLongRunning).to.be.false
    })

    it('is not long running if active but without a long running command', () => {
      const test = createTest()

      test.start({} as TestProps)
      expect(test.isLongRunning).to.be.false
    })

    it('becomes long running if active and has a long running command', () => {
      const test = createTest()

      test.start({} as TestProps)
      const command = test.addLog(createCommand()) as CommandModel

      command.isLongRunning = true
      expect(test.isLongRunning).to.be.true
    })

    it('becomes not long running if it becomes inactive', () => {
      const test = createTest()

      test.start({} as TestProps)
      const command = test.addLog(createCommand()) as CommandModel

      command.isLongRunning = true

      test.finish({} as UpdatableTestProps)
      expect(test.isLongRunning).to.be.false
    })
  })

  context('#addAgent', () => {
    it('adds the agent to the agents collection', () => {
      const test = createTest()

      test.addLog({ instrument: 'agent' } as AgentProps)
      expect(test.lastAttempt.agents.length).to.equal(1)
    })
  })

  context('#addRoute', () => {
    it('adds the route to the routes collection', () => {
      const test = createTest()

      test.addLog({ instrument: 'route' } as RouteProps)
      expect(test.lastAttempt.routes.length).to.equal(1)
    })
  })

  context('#addCommand', () => {
    it('adds the command to the commands collection', () => {
      const test = createTest()

      test.addLog(createCommand())
      expect(test.lastAttempt.commands.length).to.equal(1)
    })

    it('creates a hook and adds the command to it if it does not exist', () => {
      const test = createTest({ hooks: [
        { hookName: 'before each', hookId: 'h1' },
      ] })

      test.addLog(createCommand({ instrument: 'command', hookId: 'h1' }))
      expect(test.lastAttempt.hooks.length).to.equal(2)
      expect(test.lastAttempt.hooks[0].hookName).equal('before each')
      expect(test.lastAttempt.hooks[0].commands.length).to.equal(1)
    })

    it('adds the command to an existing hook if it already exists', () => {
      const test = createTest({ hooks: [{ hookId: 'h1', hookName: 'before each' }] })
      const commandProps = createCommand({
        hookId: 'h1',
      })

      const command = test.addLog(commandProps) as CommandModel

      command.isMatchingEvent = () => false

      expect(test.lastAttempt.hooks.length).to.equal(2)
      expect(test.lastAttempt.hooks[0].hookName).to.equal('before each')
      expect(test.lastAttempt.hooks[0].commands.length).to.equal(1)
      test.addLog(createCommand({ hookId: 'h1' }))
      expect(test.lastAttempt.hooks.length).to.equal(2)
      expect(test.lastAttempt.hooks[0].commands.length).to.equal(2)
    })

    it('adds the command to the correct hook', () => {
      const test = createTest({
        hooks: [
          { hookId: 'h1', hookName: 'before each' },
          { hookId: 'h2', hookName: 'before each' },
        ],
      })

      test.addLog(createCommand({ hookId: 'h1' }))
      expect(test.lastAttempt.hooks[0].commands.length).to.equal(1)
      expect(test.lastAttempt.hooks[1].commands.length).to.equal(0)
      expect(test.lastAttempt.hooks[2].commands.length).to.equal(0)

      test.addLog(createCommand({ hookId: 'h2' }))
      expect(test.lastAttempt.hooks[0].commands.length).to.equal(1)
      expect(test.lastAttempt.hooks[1].commands.length).to.equal(1)
      expect(test.lastAttempt.hooks[2].commands.length).to.equal(0)
    })

    it('moves hooks into the correct order', () => {
      const test = createTest({
        hooks: [
          { hookId: 'h1', hookName: 'before all' },
          { hookId: 'h2', hookName: 'before each' },
        ],
      })

      test.addLog(createCommand({ hookId: 'h2' }))
      expect(test.lastAttempt.hooks[0].hookId).to.equal('h2')
      expect(test.lastAttempt.hooks[0].invocationOrder).to.equal(0)
      expect(test.lastAttempt.hooks[0].commands.length).to.equal(1)

      test.addLog(createCommand({ hookId: 'h1' }))
      expect(test.lastAttempt.hooks[1].hookId).to.equal('h1')
      expect(test.lastAttempt.hooks[1].invocationOrder).to.equal(1)
      expect(test.lastAttempt.hooks[1].commands.length).to.equal(1)
    })

    it('counts and assigns the number of each hook type', () => {
      const test = createTest({
        hooks: [
          { hookId: 'h1', hookName: 'before each' },
          { hookId: 'h2', hookName: 'after each' },
          { hookId: 'h3', hookName: 'before each' },
        ],
      })

      test.addLog(createCommand({ hookId: 'h1' }))
      expect(test.lastAttempt.hookCount['before each']).to.equal(1)
      expect(test.lastAttempt.hookCount['after each']).to.equal(0)
      expect(test.lastAttempt.hooks[0].hookNumber).to.equal(1)

      test.addLog(createCommand({ hookId: 'h1' }))
      expect(test.lastAttempt.hookCount['before each']).to.equal(1)
      expect(test.lastAttempt.hookCount['after each']).to.equal(0)
      expect(test.lastAttempt.hooks[0].hookNumber).to.equal(1)

      test.addLog(createCommand({ hookId: 'h3' }))
      expect(test.lastAttempt.hookCount['before each']).to.equal(2)
      expect(test.lastAttempt.hookCount['after each']).to.equal(0)
      expect(test.lastAttempt.hooks[1].hookNumber).to.equal(2)

      test.addLog(createCommand({ hookId: 'h2' }))
      expect(test.lastAttempt.hookCount['before each']).to.equal(2)
      expect(test.lastAttempt.hookCount['after each']).to.equal(1)
      expect(test.lastAttempt.hooks[2].hookNumber).to.equal(1)
    })
  })

  context('#start', () => {
    it('sets the test as active', () => {
      const test = createTest()

      test.start({} as TestProps)
      expect(test.isActive).to.be.true
    })
  })

  context('#finish', () => {
    it('sets the test as inactive', () => {
      const test = createTest()

      test.finish({} as UpdatableTestProps)
      expect(test.isActive).to.be.false
    })

    it('updates the state of the test', () => {
      const test = createTest()

      test.finish({ state: 'failed' } as UpdatableTestProps)
      expect(test.state).to.equal('failed')
    })

    it('updates the test err', () => {
      const test = createTest()

      test.finish({ err: { name: 'SomeError' } as Err } as UpdatableTestProps)
      expect(test.err.name).to.equal('SomeError')
    })

    it('sets the hook to failed if it exists', () => {
      const test = createTest({ hooks: [{ hookId: 'h1', hookName: 'before each' }] })

      test.addLog(createCommand({ instrument: 'command' }))
      test.finish({ hookId: 'h1', err: { message: 'foo' } as Err } as UpdatableTestProps)
      expect(test.lastAttempt.hooks[1].failed).to.be.true
    })

    it('does not throw error if hook does not exist', () => {
      const test = createTest()

      expect(() => {
        test.finish({ hookId: 'h1' } as UpdatableTestProps)
      }).not.to.throw()
    })
  })

  context('#commandMatchingErr', () => {
    it('returns last command matching the error', () => {
      const test = createTest({ err: { message: 'SomeError' } as Err, hooks: [
        { hookId: 'h1', hookName: 'before each' },
        { hookId: 'h2', hookName: 'before each' },
      ] })

      test.addLog(createCommand({ err: { message: 'SomeError' } as Err, hookId: 'h1' }))
      test.addLog(createCommand({ err: {} as Err, hookId: 'h1' }))
      test.addLog(createCommand({ err: { message: 'SomeError' } as Err, hookId: 'h1' }))
      test.addLog(createCommand({ err: {} as Err, hookId: 'h2' }))
      test.addLog(createCommand({ name: 'The One', err: { message: 'SomeError' } as Err, hookId: 'h2' }))
      expect(test.commandMatchingErr()!.name).to.equal('The One')
    })

    it('returns undefined if there are no commands with errors', () => {
      const test = createTest({ err: { message: 'SomeError' } as Err, hooks: [
        { hookId: 'h1', hookName: 'before each' },
        { hookId: 'h2', hookName: 'before each' },
        { hookId: 'h3', hookName: 'before each' },
      ] })

      expect(test.commandMatchingErr()).to.be.undefined
    })
  })

  context('#isOpen', () => {
    it('false by default', () => {
      const test = createTest()

      test.start({} as TestProps)

      expect(test.isOpen).eq(false)
    })

    it('true when the model is long running', () => {
      const test = createTest()

      test.start({} as TestProps)
      const command = test.addLog(createCommand()) as CommandModel

      command.isLongRunning = true
      expect(test.isOpen).eq(true)
    })

    it('true when there is only one test', () => {
      const test = createTest({}, { hasSingleTest: true })

      expect(test.isOpen).eq(true)
    })

    it('false when toggled from true', () => {
      const test = createTest({}, { hasSingleTest: true })

      test.toggleOpen()

      expect(test.isOpen).eq(false)
    })

    it('true when toggled from false', () => {
      const test = createTest()

      expect(test.isOpen).eq(false)
    })
  })
})
