function MemoryDump(memory, view) {
    this._memory = memory;
    this.formula = view.formula;
    this.addr = view.addr;
    this.data = ko.pureComputed(function () {
        var rows = [];
        for ( var i = 0; i < view.data().length; i += 16 ) {
            rows.push({
                addr: ko.pureComputed((function (i) { return function () { return (this.addr() + i) & 0xFFFF; } })(i), this),
                data: view.data.slice(i, i + 16)
            });
        }
        return rows;
    }, this);
}