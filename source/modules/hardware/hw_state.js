function HWState() {
    var _onPerformance = new ZX_Event();

    this.perfomance = { frequency: 0, fps: 0 };

    this.get_onPerformance = function () {
        return _onPerformance.pub;
    }

    this.updatePerformance = function (data) {
        this.perfomance = data;
        _onPerformance.emit(data);
    }
}
Object.assign(HWState, {
    _instance: null,
    get_instance: function () {
        if (!this._instance) {
            this._instance = new HWState();
        }
        return this._instance;
    }
});
