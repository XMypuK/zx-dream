function Dasm(root) {
    this.records = ko.observableArray([]).extend({ ordered: {
        keyFn: function (record) { return record.addr; },
        cmdFn: function (addr1, addr2) { return addr1 - addr2; }
    }});
    this.visibleIndex = ko.observable(0);
    this.visibleCount = ko.observable(16);
    this.visibleRecords = ko.pureComputed(function () {
        if (this.visibleIndex() >= 0 && this.visibleIndex() < this.records().length)
            return this.records.slice(this.visibleIndex(), this.visibleIndex() + this.visibleCount());
        return [];
    }, this);
    this.pointerIndex = ko.observable(0);
    this.cursorIndex = ko.observable(0).extend({ incdec: true });
    this.beginAddr = ko.pureComputed(function () {
        if (this.records().length)
            return this.records()[0].addr;
        return undefined;
    }, this);
    this.endAddr = ko.pureComputed(function () {
        if (this.records().length)
            return this.records()[this.records().length - 1].get_next();
        return undefined;
    }, this);
    
    this.cursorUp = function() {
        this.cursorIndex.dec(1, 0);
        this.scrollToCursor();
    }

    this.cursorDown = function () {
        this.cursorIndex.inc(1, this.records().length);
        this.scrollToCursor();
    }

    this.cursorPageUp = function () {
        this.cursorIndex.dec(this.visibleCount(), 0);
        this.scrollToCursor();
    }

    this.cursorPageDown = function () {
        this.cursorIndex.inc(this.visibleCount(), this.records().length);
        this.scrollToCursor();
    }
    
    this.scrollToCursor = function () {
        if (this.cursorIndex() < this.visibleIndex()) {
            this.visibleIndex(this.cursorIndex());
        }
        else if (this.cursorIndex() >= (this.visibleIndex() + this.visibleCount())) {
            this.visibleIndex(Math.max(0, this.cursorIndex() - this.visibleCount() + 1));
        }
    }

    function disasmWhile(addr, whileCondition) {
        var buffer = [];
        while (whileCondition(addr)) {
            var record = DasmRecord.read(root.bus, addr);
            buffer.push(record);
            addr = record.get_next();
        }
        return buffer;
    }

    this.ensureGenueRecords = function (recordIndex) {
        var cacheRecord = this.records()[recordIndex];
        var freshRecord = DasmRecord.read(root.bus, cacheRecord.addr);
        if (cacheRecord.equals(freshRecord))
            return;
        var cacheIndex = recordIndex;
        var freshSequence = [freshRecord];
        var nextDiff;
        while (nextDiff = cacheRecord.get_next() - freshRecord.get_next()) {
            if (nextDiff < 0) {
                cacheRecord = this.records()[++cacheIndex];
            }
            else {
                freshSequence.push(freshRecord = DasmRecord.read(root.bus, freshRecord.get_next()));
            }
        }
        this.records.splice.apply(this.records, [recordIndex, cacheIndex - recordIndex + 1].concat(freshSequence));
    }

    this.update = function () {
        var pc = root.state().pc;
        if (root.state().prefix_dd || root.state().prefix_dd || root.state().prefix_ed || root.state().prefix_cb) {
            pc--;
        }
        var index = this.records.orderedSearch(pc);
        if (index >= 0) {
            this.ensureGenueRecords(index);
        }
        if (index < 0) {
            // try to prepend instructions to block
            if (this.beginAddr() !== undefined && pc < this.beginAddr() && (this.beginAddr() - pc) <= 0x0100) {
                var buffer = disasmWhile(pc, function (addr) { return addr < this.beginAddr(); }.bind(this));
                if (buffer[buffer.length - 1].get_next() == this.beginAddr()) {
                    this.records.unshift.apply(this.records, buffer);
                    index = 0;
                }
            }
            // try to append instructions to block
            else if (this.endAddr() !== undefined && this.endAddr() <= pc && (pc - this.endAddr()) <= 0x0100) {
                var next = this.endAddr();
                var buffer = disasmWhile(next, function (addr) { return (next = addr) < pc; });
                if (next == pc) {
                    this.records.push.apply(this.records, buffer);
                    index = this.records().length;
                    var i = 0;
                    buffer = disasmWhile(pc, function (addr) { return i++ < this.visibleCount(); }.bind(this));
                    this.records.push.apply(this.records, buffer);
                }
            }
            // replace current block
            if (index < 0) {
                var i = 0;
                var buffer = disasmWhile(pc, function (addr) { return i++ < this.visibleCount(); }.bind(this));
                this.records(buffer);
                index = 0;
            }
        }
        this.pointerIndex(index);
        this.cursorIndex(index);
        this.scrollToCursor();
    }
}