function DebugPorts(root, onChange) {
    this._root = root;
    this._onChange = onChange || function () { };

    this.editable = ko.pureComputed(function () { return !this._root.running(); }, this);
    this.updating = ko.observable(false);
    this.port_7FFD = this.createPortObservable();
    this.port_FE = this.createPortObservable();
    
    this.port_7FFD.subscribe(function (value) {
        if (!this.updating()) {
            root.bus.io_write(0x7FFD, value & 0xFF);
            this._onChange();
        }
    }, this);
    this.port_FE.subscribe(function (value) {
        if (!this.updating()) {
            root.bus.io_write(0xFE, value & 0xFF);
            this._onChange();
        }
    }, this);
}

DebugPorts.prototype = {
    update: function (calcModification) {
        this.updating(true);
        var value7FFD = this._root.bus.var_read('port_7ffd_value');
        var modified7FFD = this.port_7FFD() !== value7FFD;
        if (modified7FFD) {
            this.port_7FFD(value7FFD);
        }
        if (calcModification) {
            this.port_7FFD.modified(modified7FFD);
        }
        var valueFE = this._root.bus.var_read('port_fe_value');
        var modifiedFE = this.port_FE() !== valueFE;
        if (modifiedFE) {
            this.port_FE(valueFE);
        }
        if (calcModification) {
            this.port_FE.modified(modifiedFE);
        }
        this.updating(false);
    },
    createPortObservable: function () {
        var observable = ko.observable();
        observable.modified = ko.observable(false);
        observable.editable = this.editable;
        return observable;
    }
}