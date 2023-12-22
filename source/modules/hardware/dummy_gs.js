function ZX_DummyGS() {
    this.connect = connect;

    function connect(bus) {
        bus.on_io_read(io_read_bb, { mask: 0xFF, value: 0xBB });
    }

    function io_read_bb(address) {
        return 0;
    }
}