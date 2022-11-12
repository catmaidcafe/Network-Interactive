const prompts = require("prompts");
const { networkInterfaces } = require("os");
const { exec, spawnSync } = require("child_process");
const dns = require("dns");
const fs = require("fs");
const crypto = require("crypto");
const extract = require("extract-zip");

const network = networkInterfaces();
let navStack = [];

//Specific Question Sets
const homeQ = require("./questions/home.json");
const networkQ = require("./questions/network.json");

//Generic Question Sets
const selectionQ = require("./questions/selection.json");

async function home() {
  //app start
  const homePrompt = await prompts(homeQ);
  promptRes(homePrompt);
  navStack.push("home");
}

async function promptRes(res, data) {
  const results = Object.create(null); // Or just '{}', an empty object

  for (const name of Object.keys(network)) {
    for (const net of network[name]) {
      const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
      if (net.family === familyV4Value) {
        if (!results[name]) {
          results[name] = {};
        }
        results[name] = net;
      }
    }
  }

  switch (res.value) {
    case "network":
      let networkQ2 = networkQ;

      const child = spawnSync("bash", ["-c", "ip r"]).stdout.toString();
      const gateway = child.match(/default via (.*?)\s/)[1];

      networkQ2[0].initial = results[data.value].address;
      networkQ2[1].initial = results[data.value].netmask;
      networkQ2[2].initial = gateway;
      networkQ2[3].initial = dns.getServers()[0];

      const networkRes = await prompts(networkQ2);
      setDNS(data.value, networkRes, true);
      break;
    case "network-pre":
      let interQ = selectionQ;

      Object.keys(results).forEach((interf) => {
        interQ.choices.push({ title: interf, value: interf });
      });

      interQ.message = "Please select the adapter to update";

      const interfaces = await prompts(interQ);
      promptRes({ value: "network" }, interfaces);
      break;
    case "update-pre":
      let fileList = fs.readdirSync("./file");
      let hashArray = [];

      fileList.map((file) => {
        var data = fs.readFileSync(`./file/${file}`);
        var pubkey = fs.readFileSync("./keys/public.pem", "utf8");
        var signature = fs.readFileSync("./keys/update2");
        var verifier = crypto.createVerify("RSA-SHA256");

        verifier.update(data);
        var success = verifier.verify(pubkey, signature, "hex");
        hashArray.push(success);
      });

      let fileQ = selectionQ;

      Object.keys(fileList).forEach((file, int) => {
        fileQ.choices.push({
          title: `${fileList[file]} - Hash ${
            hashArray[int] ? "V" : "Unv"
          }erified`,
          value: fileList[file],
        });
      });

      fileQ.message = "Please select the update to apply";

      const interface = await prompts(fileQ);
      promptRes({ value: "update" }, interface);
      break;
    case "update":
      console.log(data);
      await extract(`./file/${data.value}`, { dir: __dirname + `./extract` });

      
      var child_process = require("child_process");

      child_process.exec(
        __dirname + `.//extract/run.bat`,
        function (error, stdout, stderr) {
          console.log(stdout);
        }
      );
      break;
    case "exit":
      return null;
    default:
      break;
  }
}

function setDNS(network, ans, sudo) {
  const { ip, mask, gateway, dns } = ans;

  let maskNodes = mask.match(/(\d+)/g);
  let cidr = 0;
  for (let i in maskNodes) {
    cidr += ((maskNodes[i] >>> 0).toString(2).match(/1/g) || []).length;
  }

  exec(
    `${
      sudo && "sudo "
    }nmcli con mod netplan-${network} ipv4.addresses ${ip}/${cidr} ipv4.gateway ${gateway} ipv4.dns ${dns} ipv4.method manual`,
    (error, stdout, stderr) => {
      if (error) console.error(error);
      if (stderr) console.error(stderr);
      if (stdout) {
        console.log("Successfully updated the network!");
        exec(`nmcli con up ${network}`);
      }
      goBack();
    }
  );
}

function goBack() {
  switch (navStack[navStack.length - 1]) {
    case "home":
      navStack.pop();
      home();
      break;
  }
}

home();
