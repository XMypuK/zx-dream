function ZX_DummyGS() {
    this.connect = connect;

    function connect(bus) {
        bus.on_io_read(io_read);
    }

    function io_read(address) {
        if ((address & 0xFF) == 0xBB) {
            return 0;
        }
    }
}