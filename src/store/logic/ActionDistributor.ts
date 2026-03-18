import { GameState, UserAction } from '../../types';
import { advanceDay } from '../../services/llm/llm';

export type ActionHandler = (state: GameState, action: UserAction) => Promise<any>;

class ActionDistributor {
    private handlers: Map<string, ActionHandler> = new Map();

    register(actionType: string, handler: ActionHandler) {
        this.handlers.set(actionType, handler);
    }

    async dispatch(state: GameState, action: UserAction): Promise<any> {
        const handler = this.handlers.get(action.type);
        if (!handler) {
            // Fallback to default advanceDay if no specific handler is registered
            return advanceDay(state, action);
        }
        return handler(state, action);
    }
}

export const actionDistributor = new ActionDistributor();
