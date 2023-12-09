function DebugCommandDispatcher(hotKeyContainer) {
    var handlers = {};
    var hotKeys = {};
    
    this.context = ko.observable('');
    this.availableCommands = ko.observableArray([]).extend({ ordered: {
        keyFn: function (cmd) { return cmd; },
        cmpFn: function (cmd1, cmd2) { if (cmd1 < cmd2) return -1; else if (cmd1 > cmd2) return 1; else return 0; },
        noThrow: true
    }});
    this.enable = function (commands) {
        for ( var i = 0; i < commands.length; i++ ) {
            this.availableCommands.orderedInsert(commands[i]);
        }
    };
    this.disable = function (commands) {
        this.availableCommands.removeAll(commands);
    };
    this.registerHandler = function (commands, handler) {
        for ( var i = 0; i < commands.length; i++ ) {
            var cmd = commands[i];
            var cmdhlrs = handlers[cmd] || (handlers[cmd] = []);
            cmdhlrs.push(handler);
        }
    };
    this.unregisterHandler = function (commands, handler) {
        for ( var i = 0; i < commands.length; i++ ) {
            var cmd = commands[i];
            var cmdhlrds = handlers[cmd];
            if (cmdhlrds) {
                var handlerIndex = cmdhlrds.indexOf(handler);
                if (handlerIndex >= 0) {
                    cmdhlrds.splice(handlerIndex, 1);
                }
            }
        }
    };
    this.fire = function (command, force) {
        if (this.availableCommands.orderedSearch(command) < 0 && !force)
            return;
        var cmdhlrds = handlers[command];
        if (cmdhlrds) {
            for ( var i = 0; i < cmdhlrds.length; i++ ) {
                cmdhlrds[i](command);
            }
        }
    };
    this.assignHotKey = function (keyCode, contexts, command) {
        var assignments = hotKeys[keyCode] || (hotKeys[keyCode] = {});
        for ( var i = 0; i < contexts.length; i++ ) {
            assignments[contexts[i]] = command;
        }
    };

    var onKeyDown = (function (e) {
        var keyCode = e.which;
        var assignments = hotKeys[keyCode];
        if (!assignments)
            return;
        var command= assignments[this.context() || ''];
        if (command) {
            this.fire(command);
            e.stopPropagation();
        }
    }).bind(this);

    $(hotKeyContainer)
        .prop('tabIndex', 0)
        .on('click', function (e) {
            $(e.currentTarget).focus();
            var context = $(e.target).closest('[data-focus-context]').attr('data-focus-context');
            this.context(context || '');
         }.bind(this))
        .on('keydown', onKeyDown);
};