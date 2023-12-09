function MemoryWatch(memory, view) {
    this._memory = memory;
    this.formula = view.formula;
    this.addr = view.addr;
    this.wordFormat = ko.observable(false);
    this.bytes = view.data;
    this.words = ko.observableArray([]);		
    this.data = ko.pureComputed(function () {
        if (this.wordFormat())
            return this.words();
        else
            return this.bytes();
    }, this);
    this.reinitWords = function () {
        var wordCount = view.data().length >> 1;
        if (this.words().length < wordCount) {
            for ( var i = this.words().length; i < wordCount; i++ ) {
                this.words.push(this.createWordItem(view.data()[2 * i], view.data()[2 * i + 1]));
            }
        }
        else if (this.words().length > wordCount) {
            var removedItems = this.words.splice(wordCount);
            for ( var i = 0; i < removedItems.length; i++ ) {
                this.disposeWordItem(removedItems[i]);
            }
        }
    };
    this.createWordItem = function (loByte, hiByte) {
        var item = ko.pureComputed({
            read: function () { return loByte() | (hiByte() << 8); },
            write: function (value) { 
                this._memory.writeScopeCounter.inc();
                loByte(value & 0xFF); 
                hiByte((value >> 8) & 0xFF); 
                this._memory.writeScopeCounter.dec();
            },
            owner: this
        });
        item.modified = ko.pureComputed(function () {
            return loByte.modified() || hiByte.modified();
        }, this); 
        item.editable = this._memory.editable;
        return item;
    }
    this.disposeWordItem = function (item) { }		
    view.data.subscribe(this.reinitWords.bind(this));
    this.reinitWords();
}