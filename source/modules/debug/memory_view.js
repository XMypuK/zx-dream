function MemoryView(memory, formula, length) {
    this._memory = memory;
    this.formula = this.createFormulaObservable(formula);
    this.addr = ko.observable();
    this.length = ko.observable(length || 16);
    this.data = ko.observableArray([]);
}

MemoryView.prototype = {
    update: function (calcModification) {
        var addr;
        try { addr = DebugUtils.evaluateExpression(this.formula(), this._memory.bus, this._memory.state()); }
        catch (e) { }
        if (addr === undefined) {
            this.data.splice(0, this.data().length);
            return;
        }
        this.addr(addr);
        if (this.data().length !== this.length()) {
            this.initData();
        }
        for ( var i = 0; i < this.data().length; i++ ) {
            var val8 = this._memory.bus.mem_read((addr + i) & 0xFFFF);
            var item = this.data()[i];
            var modified = item() !== val8;
            if (modified) {
                item(val8);
            }
            if (calcModification) {
                item.modified(modified);
            }
        }
    },
    initData: function (initData) {
        if (this.data().length < this.length()) {
            for ( var i = this.data().length; i < this.length(); i++ ) {
                this.data()[i] = this.createDataItem(i);
            }
            this.data.notifySubscribers(this.data());
        }
        else if (this.data().length > this.length()) {
            var removedItems = this.data.splice(this.length());
            for ( var i = 0; i < removedItems.length; i++ ) {
                this.disposeDataItem(removedItems[i]);
            }
        }
    },
    createFormulaObservable: function (defaultValue) {
        var formula = ko.observable(defaultValue || '');
        formula.editable = this._memory.editable;
        formula.subscribe(function (value) {
            if (this._memory.updating())
                return;
            this._memory.writeScopeCounter.inc();
            this._memory.writeScopeCounter.dec();
        }, this);
        return formula;
    },
    createDataItem: function (i) {
        var item = ko.observable();
        item.modified = ko.observable(false);
        item.editable = this._memory.editable;
        item.writeSubscription = item.subscribe(function (value) { 
            if (this._memory.updating())
                return;
            this._memory.writeScopeCounter.inc();
            this._memory.bus.mem_write((this.addr() + i) & 0xFFFF, value);
            this._memory.writeScopeCounter.dec();
        }, this);
        return item;
    },
    disposeDataItem: function (item) {
        if (item.writeSubscription) {
            item.writeSubscription.dispose();
            delete item.writeSubscription;
        }
    }
};