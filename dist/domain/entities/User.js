"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
class User {
    props;
    constructor(props) {
        this.props = props;
    }
    get telegramId() {
        return this.props.telegramId;
    }
    get fullName() {
        const { firstName = '', lastName = '' } = this.props;
        return `${firstName} ${lastName}`.trim();
    }
    get username() {
        return this.props.username;
    }
}
exports.User = User;
//# sourceMappingURL=User.js.map