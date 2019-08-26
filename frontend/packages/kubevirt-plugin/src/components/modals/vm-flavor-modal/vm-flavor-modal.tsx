import * as React from 'react';
import * as _ from 'lodash';
import { getVmTemplate, getResource } from 'kubevirt-web-ui-components';
import {
  HandlePromiseProps,
  withHandlePromise,
  Dropdown,
  convertToBaseValue,
  Firehose,
} from '@console/internal/components/utils';
import { TemplateModel } from '@console/internal/models';
import {
  createModalLauncher,
  ModalTitle,
  ModalBody,
  ModalComponentProps,
  ModalFooter,
} from '@console/internal/components/factory';
import { k8sPatch, TemplateKind } from '@console/internal/module/k8s';
import { Form, FormGroup, TextInput } from '@patternfly/react-core';
import { VMKind, VMLikeEntityKind } from '../../../types';
import {
  getFlavor,
  getMemory,
  getCPU,
  getOperatingSystem,
  getWorkloadProfile,
  isVM,
} from '../../../selectors/vm';
import {
  getTemplateFlavors,
  getTemplates,
  selectVM,
} from '../../../selectors/vm-template/selectors';
import { getUpdateFlavorPatches } from '../../../k8s/patches/vm/vm-patches';
import { VirtualMachineModel } from '../../../models';
import {
  CUSTOM_FLAVOR,
  NAMESPACE_OPENSHIFT,
  TEMPLATE_TYPE_LABEL,
  TEMPLATE_TYPE_BASE,
} from '../../../constants';
import './_vm-flavor-modal.scss';

const MB = 1000 ** 2;

const getId = (field: string) => `vm-flavor-modal-${field}`;
const dehumanizeMemory = (memory?: string) => {
  if (!memory) {
    return null;
  }

  return convertToBaseValue(memory) / MB;
};

const getFlavors = (vm: VMLikeEntityKind, templates: TemplateKind[]) => {
  const vmTemplate = getVmTemplate(vm);

  const flavors = {
    // always listed
    [CUSTOM_FLAVOR]: CUSTOM_FLAVOR,
  };

  if (vmTemplate) {
    // enforced by the vm
    const templateFlavors = getTemplateFlavors([vmTemplate]);
    templateFlavors.forEach((f) => (flavors[f] = f));
  }

  // if VM OS or Workload is set, add flavors of matching templates only. Otherwise list all flavors.
  const vmOS = getOperatingSystem(vm);
  const vmWorkload = getWorkloadProfile(vm);
  const matchingTemplates = getTemplates(templates, vmOS, vmWorkload, undefined);
  const templateFlavors = getTemplateFlavors(matchingTemplates);
  templateFlavors.forEach((f) => (flavors[f] = f));

  return flavors;
};

const VMFlavorModal = withHandlePromise((props: VMFlavornModalProps) => {
  const { vmLike, templates, inProgress, errorMessage, handlePromise, close, cancel } = props;

  const flattenTemplates = _.get(templates, 'data', []) as TemplateKind[];

  const vmFlavor = getFlavor(vmLike);
  const flavors = getFlavors(vmLike, flattenTemplates);

  const sourceMemory = isVM(vmLike)
    ? getMemory(vmLike as VMKind)
    : getMemory(selectVM(vmLike as TemplateKind));

  const sourceCPURaw = isVM(vmLike)
    ? getCPU(vmLike as VMKind)
    : getCPU(selectVM(vmLike as TemplateKind));
  let sourceCPU = parseInt(sourceCPURaw, 10);
  if (!sourceCPU) {
    sourceCPU =
      (parseInt(sourceCPURaw.sockets, 10) || 1) *
      (parseInt(sourceCPURaw.cores, 10) || 1) *
      (parseInt(sourceCPURaw.threads, 10) || 1);
  }

  const [flavor, setFlavor] = React.useState(vmFlavor);
  const [mem, setMem] = React.useState(
    vmFlavor === CUSTOM_FLAVOR ? dehumanizeMemory(sourceMemory) : 1,
  );
  const [cpu, setCpu] = React.useState(vmFlavor === CUSTOM_FLAVOR ? sourceCPU : 1);

  const submit = (e) => {
    e.preventDefault();

    const patches = getUpdateFlavorPatches(vmLike, flattenTemplates, flavor, cpu, `${mem}M`);
    if (patches.length === 0) {
      close();
    } else {
      const model = isVM(vmLike) ? VirtualMachineModel : TemplateModel;
      const promise = k8sPatch(model, vmLike, patches);
      handlePromise(promise).then(close); // eslint-disable-line promise/catch-or-return
    }
  };

  let topClass = 'modal-content ';
  topClass +=
    flavor === CUSTOM_FLAVOR
      ? 'kubevirt-vm-flavor-modal__content-custom'
      : 'kubevirt-vm-flavor-modal__content-generic';

  return (
    <div className={topClass}>
      <ModalTitle>Edit Flavor</ModalTitle>
      <ModalBody>
        <Form onSubmit={submit} className="kubevirt-vm-flavor-modal__form" isHorizontal>
          <FormGroup label="Flavor" fieldId={getId('flavor')}>
            <Dropdown
              items={flavors}
              onChange={(f) => setFlavor(f)}
              selectedKey={flavor || CUSTOM_FLAVOR}
              title={flavor}
              className="kubevirt-vm-flavor-modal__dropdown"
              buttonClassName="kubevirt-vm-flavor-modal__dropdown-button"
            />
          </FormGroup>

          {flavor === CUSTOM_FLAVOR && (
            <React.Fragment>
              <FormGroup label="CPUs" isRequired fieldId={getId('cpu')}>
                <TextInput
                  isRequired
                  type="number"
                  id={getId('cpu')}
                  value={cpu}
                  onChange={(v) => setCpu(parseInt(v, 10) || 1)}
                  aria-label="CPU count"
                />
              </FormGroup>
              <FormGroup label="Memory (MB)" isRequired fieldId={getId('memory')}>
                <TextInput
                  isRequired
                  type="number"
                  id={getId('memory')}
                  value={mem}
                  onChange={(v) => setMem(parseInt(v, 10) || 1)}
                  aria-label="Memory"
                />
              </FormGroup>
            </React.Fragment>
          )}
        </Form>
      </ModalBody>
      <ModalFooter inProgress={inProgress} errorMessage={errorMessage}>
        <button type="button" onClick={cancel} className="btn btn-default">
          Cancel
        </button>
        <button type="button" onClick={submit} className="btn btn-primary" id="confirm-action">
          Save
        </button>
      </ModalFooter>
    </div>
  );
});

const VMFlavorModalFirehose = (props) => {
  const resources = [
    getResource(TemplateModel, {
      namespace: NAMESPACE_OPENSHIFT,
      prop: 'templates',
      matchLabels: { [TEMPLATE_TYPE_LABEL]: TEMPLATE_TYPE_BASE },
    }),
  ];

  return (
    <Firehose resources={resources}>
      <VMFlavorModal {...props} />
    </Firehose>
  );
};

export type VMFlavornModalProps = HandlePromiseProps &
  ModalComponentProps & {
    vmLike: VMLikeEntityKind;
    templates?: any;
  };

export const vmFlavorModal = createModalLauncher(VMFlavorModalFirehose);
