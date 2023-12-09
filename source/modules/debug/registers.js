function DebugRegisters(root, onChange) {
    this._root = root;
    this._onChange = onChange || function () { }

    this.lastState = ko.observable();
    this.state = ko.observable();
    this.editable = ko.pureComputed(function () { return !this._root.running(); }, this);
    this.updating = ko.observable(false);
    this.state.subscribe(function (value) {
        if (!this.updating() && value) {
            this._root.cpu.set_state(value);
            this._onChange();
        }
    }, this);

    this.createRegisterObservable = function (reg, notEditable) {
        var observable = ko.pureComputed({
            read: function() { return this.state()[reg]; },
            write: function(value) { this.state()[reg] = value; this.state.valueHasMutated(); },
            owner: this
        });
        observable.modified = ko.pureComputed(function () { return !this.lastState() || this.lastState()[reg] != this.state()[reg]; }, this);
        observable.editable = notEditable ? false : this.editable;
        return observable;
    }

    this.createFlagsObservable = function (reg, regMask, flagsMask, notEditable) {
        var shift = 0;
        for ( var bits = flagsMask; !(bits & 1); bits = bits >> 1 ) {
            shift++;
        }
        var observable = ko.pureComputed({
            read: function () { return (this.state()[reg] & flagsMask) >> shift; },
            write: function (value) { this.state()[reg] = (this.state()[reg] & (flagsMask ^ regMask)) | ((value << shift) & flagsMask); this.state.valueHasMutated(); },
            owner: this
        });
        observable.modified = ko.pureComputed(function () { return !this.lastState() || !!((this.lastState()[reg] ^ this.state()[reg]) & flagsMask); }, this);
        observable.editable = notEditable ? false : this.editable;
        return observable;				
    }			
    
    this.update = function (calcModification) {
        this.updating(true);
        if (calcModification) {
            this.lastState(this.state());
        }
        this.state(this._root.state());
        this.updating(false);
    }

    this.pc = this.createRegisterObservable('pc', true);
    this.sp = this.createRegisterObservable('sp');
    this.ix = this.createRegisterObservable('ix'); 
    this.iy = this.createRegisterObservable('iy'); 
    this.hl = this.createRegisterObservable('hl'); 
    this.de = this.createRegisterObservable('de'); 
    this.bc = this.createRegisterObservable('bc'); 
    this.af = this.createRegisterObservable('af'); 
    this.hl_ = this.createRegisterObservable('hl_'); 
    this.de_ = this.createRegisterObservable('de_'); 
    this.bc_ = this.createRegisterObservable('bc_'); 
    this.af_ = this.createRegisterObservable('af_'); 
    this.i = this.createRegisterObservable('i');  
    this.r = this.createRegisterObservable('r'); 
    this.fs = this.createFlagsObservable('af', 0xFFFF, 0x80);
    this.fz = this.createFlagsObservable('af', 0xFFFF, 0x40);
    this.fh = this.createFlagsObservable('af', 0xFFFF, 0x10);
    this.fp = this.createFlagsObservable('af', 0xFFFF, 0x04);
    this.fn = this.createFlagsObservable('af', 0xFFFF, 0x02);
    this.fc = this.createFlagsObservable('af', 0xFFFF, 0x01);
    this.iff = this.createFlagsObservable('iff', 0xFF, 0x03);
    this.imf = this.createFlagsObservable('imf', 0xFF, 0x03);
}