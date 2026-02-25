### Backend
#### Functionality / Flexibility
- [ ] Add support for init containers.
- [x] Add rocksdb backend for Surreal to persist data across restarts
- [ ] Make creations transactional so if the init template fails the database doesn't contain any uninitialized servers.
- [x] Troubleshoot status updates for "Terminating" pods.
- [x] Utilize the resource watching capabilities of kube for more realtime updates.
- [x] Update application to accept configuration for default storage class, pod template name, port, etc.
- [x] Complete the pod_template so that it uses resources etc.
- [x] Decompose the individual resources from init.yaml into separate templates.
- [x] Decompose individual resources from pod_template.yaml into separate templates.
- [ ] ~~Support tera reloading?~~
- [x] Support starting a container for SFTP only
- [x] Add support for sftp_user_id property
- [x] Implement editing a server.
- [ ] Implement connected user count
- [x] Implement log streaming
- [x] Add `default_max_players` to template.
#### Safety
- [x] Add better sanitization for data sent to kubernetes
- [x] Generate random password for sftp server
#### Optimizations
- [ ] Consider creating a background task for syncing certain data from kubernetes periodically (such as the pod name, service name, pvc name, connected player count (TBD)). 
    This could be a performance gain especially for fetching the connected user counts later on.
### Frontend
#### Functionality
- [x] Update front end create server modal to display the remaining properties for the template and new game server request
    including resources and more. Maybe use separate tabs for the various settings since there is quite a lot.
- [x] Add log streaming element so users can easily see logs.
#### Features
- [x] Add image to server tiles based on the `icon_url` property
- [x] Add a button on server tile to allow starting in SFTP only mode. This allows setup and file copies to be done before
    first launch
### Shared
- [ ] Add table in database for game template sources. it is essentially a list of URLs which can be used to fetch game server templates.
    Add option under settings to manage Game Template Repositories
