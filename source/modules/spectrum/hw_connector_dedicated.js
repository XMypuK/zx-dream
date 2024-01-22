function HWConnectorDedicated(workerContext, underlyingHWConnector) {
    this._workerContext = workerContext;
    this._hwConnector = underlyingHWConnector;
    this._reHandlers = {};
    this._mainReadyPromise = Promise.withResolvers();
    this._lastBorderCanvas = null;
    this._lastScreenCanvas = null;
    this._init();
}
Object.assign(HWConnectorDedicated.prototype, {
    _init: function () {
        this._workerContext.onmessage = this._onHostMessage.bind(this);
    },
    _onHostMessage: function (e) {
        var message = e.data;
        switch (message.type) {
            case HWCONNECTOR_MESSAGE_TYPE.mainReady:
                this._mainReadyPromise.resolve();
                break;
            case HWCONNECTOR_MESSAGE_TYPE.rpc:
                this._processRpcRequest(message.method, message.args).then(function (result) {
                    this._sendRpcResult(message.rpcId, result);
                }.bind(this)).catch(function (error) {
                    this._sendRpcError(message.rpcId, error);
                }.bind(this));
                break;
            case HWCONNECTOR_MESSAGE_TYPE.reSubscribe:
                this._processReSubscription(message.getMethod);
                break;
            case HWCONNECTOR_MESSAGE_TYPE.reUnsubscribe:
                this._processReUnsubscription(message.getMethod);
                break;
        }
    },
    _sendRpcResult: function (rpcId, result) {
        this._workerContext.postMessage({
            type: HWCONNECTOR_MESSAGE_TYPE.rpcResult,
            rpcId: rpcId,
            result: result
        });
    },
    _sendRpcError: function (rpcId, error) {
        this._workerContext.postMessage({
            type: HWCONNECTOR_MESSAGE_TYPE.rpcError,
            rpcId: rpcId,
            error: error
        });
    },
    _processRpcRequest: function (method, args) {
        switch (method) {
            case 'propagateSettings':
                var settings = new ZX_Settings();
                settings._container = args[0];
                return this._hwConnector[method](settings);
            case 'bindVirtualDisplay':
                var offscreenCanvases = args[0];
                var borderCanvas = this._lastBorderCanvas = (offscreenCanvases[0] || this._lastBorderCanvas);
                var screenCanvas = this._lastScreenCanvas = (offscreenCanvases[1] || this._lastScreenCanvas);
                return this._hwConnector[method].call(this._hwConnector, [borderCanvas, screenCanvas]);
            default:
                return this._hwConnector[method].apply(this._hwConnector, args);
        }
    },
    _processReSubscription: function (getMethod) {
        var handler = this._reHandlers[getMethod];
        if (handler)
            return;
        handler = this._reHandlers[getMethod] = function (args) {
            this._sendReEmission(getMethod, args);
        }.bind(this);
        this._hwConnector[getMethod]().subscribe(handler);
    },
    _processReUnsubscription: function (getMethod) {
        var handler = this._reHandlers[getMethod];
        if (!handler)
            return;
        this._hwConnector[getMethod]().unsubscribe(handler);
        delete this._reHandlers[getMethod];
    },
    _sendReEmission: function (getMethod, args) {
        var handler = this._reHandlers[getMethod];
        if (handler) {
            this._workerContext.postMessage({
                type: HWCONNECTOR_MESSAGE_TYPE.reEmit,
                getMethod: getMethod,
                args: args
            },
            getMethod == 'get_onPsgDataReady' ? [args.left.buffer, args.right.buffer] : []);
        }
    },
    get_mainReady: function () {
        return this._mainReadyPromise.promise;
    },
    notifWorkerReady: function () {
        this._workerContext.postMessage({
            type: HWCONNECTOR_MESSAGE_TYPE.workerReady
        });
    }
});