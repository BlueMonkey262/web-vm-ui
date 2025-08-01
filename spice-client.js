import * as SpiceHtml5 from './src/main.js';



var host = null, port = null;
var sc;

function spice_error(e)
{
    disconnect();
}

function connect() {
    var host = document.getElementById("host").value;
    var port = document.getElementById("port").value;
    var password = document.getElementById("password").value;
    var scheme = "ws://";
    var uri;

    if (!host || !port) {
        console.log("must set host and port");
        return;
    }

    if (sc) {
        sc.stop();
    }

    uri = scheme + host + ":" + port;

    const btn = document.getElementById('connectButton');

    btn.innerHTML = "Stop Connection";
    btn.classList.add("connectBtn", "stop");
    btn.classList.remove("start");   // Remove start class to avoid conflicts
    btn.onclick = disconnect;

    try {
        sc = new SpiceHtml5.SpiceMainConn({
            uri: uri,
            screen_id: "spice-screen",
            dump_id: "debug-div",
            message_id: "message-div",
            password: password,
            onerror: spice_error,
            onagent: agent_connected
        });
    } catch (e) {
        alert(e.toString());
        disconnect();
    }
}


function disconnect() {
    const btn = document.getElementById("connectButton");

    btn.classList.remove("stop");
    btn.classList.add("connectBtn", "start");
    btn.classList.remove("stop");  // just in case

    console.log(">> disconnect");
    if (sc) {
        sc.stop();
    }

    btn.innerHTML = "Start Connection";
    btn.onclick = connect;

    if (window.File && window.FileReader && window.FileList && window.Blob) {
        const spice_xfer_area = document.getElementById('spice-xfer-area');
        if (spice_xfer_area != null) {
            document.getElementById('spice-area').removeChild(spice_xfer_area);
        }
        document.getElementById('spice-area').removeEventListener('dragover', SpiceHtml5.handle_file_dragover, false);
        document.getElementById('spice-area').removeEventListener('drop', SpiceHtml5.handle_file_drop, false);
    }
    console.log("<< disconnect");
}


function agent_connected(sc)
{
    window.addEventListener('resize', SpiceHtml5.handle_resize);
    window.spice_connection = this;

    SpiceHtml5.resize_helper(this);

    if (window.File && window.FileReader && window.FileList && window.Blob)
    {
        var spice_xfer_area = document.createElement("div");
        spice_xfer_area.setAttribute('id', 'spice-xfer-area');
        document.getElementById('spice-area').appendChild(spice_xfer_area);
        document.getElementById('spice-area').addEventListener('dragover', SpiceHtml5.handle_file_dragover, false);
        document.getElementById('spice-area').addEventListener('drop', SpiceHtml5.handle_file_drop, false);
    }
    else
    {
        console.log("File API is not supported");
    }
}
/* SPICE port event listeners
window.addEventListener('spice-port-data', function(event) {
    // Here we convert data to text, but really we can obtain binary data also
    var msg_text = arraybuffer_to_str(new Uint8Array(event.detail.data));
    DEBUG > 0 && console.log('SPICE port', event.detail.channel.portName, 'message text:', msg_text);
});

window.addEventListener('spice-port-event', function(event) {
    DEBUG > 0 && console.log('SPICE port', event.detail.channel.portName, 'event data:', event.detail.spiceEvent);
});
*/

document.getElementById('connectButton').onclick = connect;
document.getElementById('sendCtrlAltDel').addEventListener('click', function(){ SpiceHtml5.sendCtrlAltDel(sc); });

const params = new URLSearchParams(window.location.search);

const vmPort = params.get('port');
document.getElementById("port").value = vmPort;

connect()